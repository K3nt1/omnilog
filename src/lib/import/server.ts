// Logique d'import côté serveur : une œuvre à la fois, appelée par /api/import.
import {
  findImportLinks,
  findOtherImportLink,
  insertImportedLogs,
  saveImportLink,
  setExternalLinkIfAbsent,
  upsertImportedEntry,
  upsertMedia,
  type ImportedLog,
  type ImportLink,
} from "../library";
import { allIssuesRead, nextUnreadIssue } from "../comic-progress";
import { filterVolumeHits, getComicVineDetails, searchVolumeHits, type VolumeHit } from "../sources/comicvine";
import { SourceError } from "../sources/http";
import { getMalDetails } from "../sources/mal";
import { getTmdbDetails, searchTmdbMovieHits, tmdbPosterUrl, type TmdbMovieHit } from "../sources/tmdb";
import { yearOf, type LibraryStatus } from "../types";
import { letterboxdAddedDate } from "./added-date";
import { pickComic } from "./locg-match";
import { pickMatch } from "./match";
import {
  letterboxdLinkKey,
  type ComicCandidate,
  type ImportItemResult,
  type LetterboxdFilm,
  type LetterboxdWatch,
  type LocgSeries,
  type MalImportItem,
  type MatchCandidate,
} from "./types";

/** Exécute `run` sur chaque élément, avec au plus `limit` appels simultanés, dans l'ordre d'origine. */
export async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const errorMessage = (error: unknown) =>
  error instanceof SourceError ? error.message : error instanceof Error ? error.message : "Erreur inattendue";

/** Étoiles Letterboxd (0,5 à 5) -> note sur 10. */
const starsToTen = (stars: number | null) => (stars === null ? null : Math.min(10, Math.max(1, Math.round(stars * 2))));

/**
 * Prochain épisode / chapitre à consommer d'après ce qui a déjà été vu ou lu.
 * Terminé -> null ; rien vu -> 1 si "en cours", sinon null ; total atteint -> on reste sur le dernier.
 */
export function nextPosition(status: LibraryStatus, progress: number, total: number | null): number | null {
  if (status === "completed") return null;
  if (progress <= 0) return status === "in_progress" ? 1 : null;
  if (total !== null && progress >= total) return total;
  return progress + 1;
}

// ---------------------------------------------------------------------
// MyAnimeList : correspondance exacte par ID
// ---------------------------------------------------------------------

export async function importMalItem(env: CloudflareEnv, item: MalImportItem): Promise<ImportItemResult> {
  try {
    const details = await getMalDetails(env.MAL_CLIENT_ID, item.kind, item.malId);
    const mediaId = await upsertMedia(env.DB, details);
    await saveImportLink(env.DB, "mal", item.key, mediaId);
    const total = (item.kind === "anime" ? details.totalEpisodes : details.totalChapters) ?? item.total;
    const position = nextPosition(item.status, item.progress, total);
    await upsertImportedEntry(env.DB, mediaId, item.kind, {
      status: item.status,
      rating: item.score,
      review: null,
      isFavorite: false,
      currentEpisode: item.kind === "anime" ? position : null,
      currentChapter: item.kind === "manga" ? position : null,
      currentVolume:
        item.kind === "manga" && item.volumes !== undefined ? nextPosition(item.status, item.volumes, details.totalVolumes) : null,
      startedAt: item.startDate,
      completedAt: item.status === "completed" ? item.finishDate : null,
      addedAt: null, // l'export MAL ne donne pas de date d'ajout
    });
    return { key: item.key, label: details.title, status: "imported" };
  } catch (error) {
    return { key: item.key, label: item.title, status: "error", message: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------
// Letterboxd : correspondance TMDB par titre + année
// ---------------------------------------------------------------------

const toCandidate = (hit: TmdbMovieHit): MatchCandidate => ({
  tmdbId: String(hit.id),
  mediaType: "movie",
  title: hit.title,
  originalTitle: hit.original_title !== hit.title ? hit.original_title : null,
  year: yearOf(hit.release_date),
  posterUrl: tmdbPosterUrl(hit.poster_path),
});

const latest = (watches: LetterboxdWatch[]) =>
  [...watches].sort((a, b) => (a.watchedDate ?? "").localeCompare(b.watchedDate ?? "")).at(-1) ?? null;

export async function importLetterboxdFilm(
  env: CloudflareEnv,
  film: LetterboxdFilm,
  known: ImportLink | undefined,
): Promise<ImportItemResult> {
  const label = film.year ? `${film.name} (${film.year})` : film.name;
  const linkKey = letterboxdLinkKey(film);
  // Déjà relié (relance) : on garde l'œuvre et son type. Une série validée à la main
  // n'a plus de forceType à la relance, il ne faut pas la retraiter comme un film.
  const reuse = film.forceTmdbId ? undefined : known;
  // (L'import Letterboxd ne crée que des fiches TMDB : film ou série.)
  const type = (reuse?.type ?? film.forceType ?? "movie") as "movie" | "tv";
  try {
    let mediaId = reuse?.mediaId;
    let title = label;
    let tmdbId: string | undefined = film.forceTmdbId;
    let candidates: MatchCandidate[] = [];

    if (mediaId === undefined) {
      if (!tmdbId) {
        let hits = await searchTmdbMovieHits(env.TMDB_API_TOKEN, film.name, film.year);
        if (hits.length === 0 && film.year !== null) {
          hits = await searchTmdbMovieHits(env.TMDB_API_TOKEN, film.name, null);
        }
        const outcome = pickMatch(film.name, film.year, hits);
        candidates = outcome.candidates.map(toCandidate);
        if (!outcome.match) {
          return { key: film.key, label, status: hits.length > 0 ? "ambiguous" : "not_found", candidates };
        }
        tmdbId = String(outcome.match.id);
      }
      const details = await getTmdbDetails(env.TMDB_API_TOKEN, type, tmdbId);
      mediaId = await upsertMedia(env.DB, details);
      title = details.title;

      // Deux films Letterboxd différents sur la même fiche TMDB : presque toujours une erreur
      // de correspondance (remake, homonyme). On demande confirmation au lieu de fusionner.
      // Pour une série, c'est normal (épisodes listés séparément sur Letterboxd).
      if (type === "movie" && !film.allowMerge) {
        const other = await findOtherImportLink(env.DB, "letterboxd", mediaId, linkKey);
        if (other) {
          return {
            key: film.key,
            label,
            status: "conflict",
            message: `TMDB associe ce film à « ${title} », déjà rattaché à une autre entrée Letterboxd.`,
            candidates,
            tmdbId,
            tmdbType: type,
            conflictWith: other,
          };
        }
      }
    }

    await saveImportLink(env.DB, "letterboxd", linkKey, mediaId);
    if (film.uri) await setExternalLinkIfAbsent(env.DB, mediaId, "letterboxd", film.uri);

    const last = latest(film.watches);
    const lastReview = latest(film.watches.filter((w) => w.review));
    const entryId = await upsertImportedEntry(env.DB, mediaId, type, {
      status: film.status,
      rating: starsToTen(film.rating),
      review: lastReview?.review ?? null,
      isFavorite: film.liked,
      currentEpisode: null,
      currentChapter: null,
      startedAt: null,
      completedAt: film.status === "completed" ? (last?.watchedDate ?? film.addedDate) : null,
      addedAt: letterboxdAddedDate(film),
    });

    const logs: ImportedLog[] = film.watches.map((watch) => ({
      kind: type === "tv" ? "episode" : "movie",
      rating: starsToTen(watch.rating),
      review: watch.review,
      tags: watch.tags,
      externalRef: watch.ref,
      loggedAt: watch.watchedDate ? `${watch.watchedDate}T00:00:00.000Z` : new Date().toISOString(),
      note: type === "tv" ? film.name : null, // nom de l'épisode
    }));
    // Épisode marqué vu sans date dans le journal : un visionnage quand même, pour savoir lequel a été vu.
    if (type === "tv" && logs.length === 0 && film.status === "completed") {
      const date = letterboxdAddedDate(film);
      logs.push({
        kind: "episode",
        rating: starsToTen(film.rating),
        review: null,
        tags: [],
        externalRef: `${linkKey}#vu`,
        loggedAt: date ? `${date}T00:00:00.000Z` : new Date().toISOString(),
        note: film.name,
      });
    }
    await insertImportedLogs(env.DB, entryId, logs);

    const reused = reuse !== undefined;
    return { key: film.key, label: title, status: reused ? "updated" : "imported", tmdbId, tmdbType: type };
  } catch (error) {
    return { key: film.key, label, status: "error", message: errorMessage(error) };
  }
}

export async function importLetterboxdBatch(env: CloudflareEnv, films: LetterboxdFilm[]): Promise<ImportItemResult[]> {
  const known = await findImportLinks(env.DB, "letterboxd", films.map(letterboxdLinkKey));
  return mapLimit(films, 3, (film) => importLetterboxdFilm(env, film, known.get(letterboxdLinkKey(film))));
}

export function importMalBatch(env: CloudflareEnv, items: MalImportItem[]): Promise<ImportItemResult[]> {
  return mapLimit(items, 2, (item) => importMalItem(env, item));
}

// ---------------------------------------------------------------------
// League of Comic Geeks : correspondance Comic Vine par nom + année + éditeur
// ---------------------------------------------------------------------

const toComicCandidate = (h: VolumeHit): ComicCandidate => ({
  comicId: String(h.id),
  title: h.name,
  year: h.year,
  publisher: h.publisher,
  issueCount: h.issueCount,
  posterUrl: h.posterUrl,
});

/**
 * Statut d'une série d'après les numéros lus :
 * lue si tous les numéros (#1 au dernier) d'une série terminée sont lus, en cours après le plus haut numéro lu, sinon backlog.
 */
export function locgProgress(
  read: number[],
  media: { totalChapters: number | null; isOngoing: boolean },
): { status: LibraryStatus; currentChapter: number | null } {
  if (read.length === 0) return { status: "planned", currentChapter: null };
  const highest = Math.max(...read);
  // Série terminée dont chaque numéro de #1 au dernier est lu → série lue (les numéros #0, #1.5… ne comptent pas).
  // Lire seulement la fin (Detective Comics #871 à #881) ne suffit pas.
  if (!media.isOngoing && allIssuesRead(read, media.totalChapters)) return { status: "completed", currentChapter: highest };
  // Prochain numéro non lu, jamais au-delà du dernier.
  return { status: "in_progress", currentChapter: nextUnreadIssue(read, highest, media.totalChapters) ?? Math.floor(highest) + 1 };
}

export async function importLocgSeries(env: CloudflareEnv, series: LocgSeries, known: ImportLink | undefined): Promise<ImportItemResult> {
  const label = series.label;
  const reuse = series.forceComicId ? undefined : known;
  try {
    let mediaId = reuse?.mediaId;
    let comicId = series.forceComicId;
    if (mediaId === undefined) {
      if (!comicId) {
        const key = env.COMICVINE_API_KEY;
        let hits = await searchVolumeHits(key, series.name);
        let outcome = pickComic(series, hits);
        // Nom très courant (« Batman ») : la bonne série peut manquer aux 20 premiers résultats.
        if (!outcome.match) {
          hits = [...hits, ...(await filterVolumeHits(key, series.name).catch(() => []))];
          outcome = pickComic(series, hits);
        }
        if (!outcome.match) {
          return {
            key: series.key,
            label,
            status: outcome.candidates.length > 0 ? "ambiguous" : "not_found",
            comicCandidates: outcome.candidates.map(toComicCandidate),
          };
        }
        comicId = String(outcome.match.id);
      }
      mediaId = await upsertMedia(env.DB, await getComicVineDetails(env.COMICVINE_API_KEY, comicId));
    }
    await saveImportLink(env.DB, "locg", series.key, mediaId);

    const media = await env.DB.prepare("SELECT title, external_id, total_chapters, is_ongoing FROM media WHERE id = ?")
      .bind(mediaId)
      .first<{ title: string; external_id: string; total_chapters: number | null; is_ongoing: number }>();
    if (!media) throw new Error("Série introuvable après l'enregistrement");
    const read = series.issues.filter((i) => i.read);
    const { status, currentChapter } = locgProgress(
      read.map((i) => i.number),
      { totalChapters: media.total_chapters, isOngoing: media.is_ongoing === 1 },
    );
    const entryId = await upsertImportedEntry(env.DB, mediaId, "comic", {
      status,
      rating: null, // LoCG note les numéros, pas la série
      review: null,
      isFavorite: false,
      currentEpisode: null,
      currentChapter,
      startedAt: null,
      completedAt: null,
      addedAt: null, // l'export ne donne pas de date d'ajout
    });
    // Un numéro lu = une lecture au journal, sans date (l'export n'en donne pas), avec sa note.
    const now = new Date().toISOString();
    await insertImportedLogs(
      env.DB,
      entryId,
      read.map((issue) => ({
        kind: "chapter",
        chapter: issue.number,
        rating: starsToTen(issue.rating),
        review: null,
        tags: [],
        externalRef: `${series.key}#${issue.number}`,
        loggedAt: now,
        note: null,
        undated: true,
      })),
    );
    return { key: series.key, label: media.title, status: reuse ? "updated" : "imported", comicId: media.external_id };
  } catch (error) {
    return { key: series.key, label, status: "error", message: errorMessage(error) };
  }
}

export async function importLocgBatch(env: CloudflareEnv, items: LocgSeries[]): Promise<ImportItemResult[]> {
  const known = await findImportLinks(env.DB, "locg", items.map((s) => s.key));
  // Deux à la fois : Comic Vine surveille les rafales de requêtes.
  return mapLimit(items, 2, (series) => importLocgSeries(env, series, known.get(series.key)));
}
