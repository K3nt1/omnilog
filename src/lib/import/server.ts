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
import { SourceError } from "../sources/http";
import { getMalDetails } from "../sources/mal";
import { getTmdbDetails, searchTmdbMovieHits, tmdbPosterUrl, type TmdbMovieHit } from "../sources/tmdb";
import { yearOf, type LibraryStatus } from "../types";
import { letterboxdAddedDate } from "./added-date";
import { pickMatch } from "./match";
import { letterboxdLinkKey, type ImportItemResult, type LetterboxdFilm, type LetterboxdWatch, type MalImportItem, type MatchCandidate } from "./types";

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
