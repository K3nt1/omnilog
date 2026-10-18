// Logique d'import côté serveur : une œuvre à la fois, appelée par /api/import.
import {
  findMediaIdsByLetterboxdUri,
  insertImportedLogs,
  setExternalLink,
  upsertImportedEntry,
  upsertMedia,
  type ImportedLog,
} from "../library";
import { SourceError } from "../sources/http";
import { getMalDetails } from "../sources/mal";
import { getTmdbDetails, searchTmdbMovieHits, tmdbPosterUrl, type TmdbMovieHit } from "../sources/tmdb";
import { yearOf, type LibraryStatus } from "../types";
import { pickMatch } from "./match";
import type { ImportItemResult, LetterboxdFilm, LetterboxdWatch, MalImportItem, MatchCandidate } from "./types";

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
  knownMediaId: number | undefined,
): Promise<ImportItemResult> {
  const label = film.year ? `${film.name} (${film.year})` : film.name;
  try {
    let mediaId = film.forceTmdbId ? undefined : knownMediaId;
    let title = label;

    if (mediaId === undefined) {
      let tmdbId = film.forceTmdbId;
      if (!tmdbId) {
        let hits = await searchTmdbMovieHits(env.TMDB_API_TOKEN, film.name, film.year);
        if (hits.length === 0 && film.year !== null) {
          hits = await searchTmdbMovieHits(env.TMDB_API_TOKEN, film.name, null);
        }
        const { match, candidates } = pickMatch(film.name, film.year, hits);
        if (!match) {
          return {
            key: film.key,
            label,
            status: hits.length > 0 ? "ambiguous" : "not_found",
            candidates: candidates.map(toCandidate),
          };
        }
        tmdbId = String(match.id);
      }
      const details = await getTmdbDetails(env.TMDB_API_TOKEN, "movie", tmdbId);
      mediaId = await upsertMedia(env.DB, details);
      title = details.title;
    }

    if (film.uri) await setExternalLink(env.DB, mediaId, "letterboxd", film.uri);

    const last = latest(film.watches);
    const lastReview = latest(film.watches.filter((w) => w.review));
    const entryId = await upsertImportedEntry(env.DB, mediaId, "movie", {
      status: film.status,
      rating: starsToTen(film.rating),
      review: lastReview?.review ?? null,
      isFavorite: film.liked,
      currentEpisode: null,
      currentChapter: null,
      startedAt: null,
      completedAt: film.status === "completed" ? (last?.watchedDate ?? film.addedDate) : null,
    });

    const logs: ImportedLog[] = film.watches.map((watch) => ({
      kind: "movie",
      rating: starsToTen(watch.rating),
      review: watch.review,
      tags: watch.tags,
      externalRef: watch.ref,
      loggedAt: watch.watchedDate ? `${watch.watchedDate}T00:00:00.000Z` : new Date().toISOString(),
    }));
    await insertImportedLogs(env.DB, entryId, logs);

    return { key: film.key, label: title, status: knownMediaId !== undefined && !film.forceTmdbId ? "updated" : "imported" };
  } catch (error) {
    return { key: film.key, label, status: "error", message: errorMessage(error) };
  }
}

export async function importLetterboxdBatch(env: CloudflareEnv, films: LetterboxdFilm[]): Promise<ImportItemResult[]> {
  const known = await findMediaIdsByLetterboxdUri(
    env.DB,
    films.flatMap((f) => (f.uri ? [f.uri] : [])),
  );
  return mapLimit(films, 3, (film) => importLetterboxdFilm(env, film, film.uri ? known.get(film.uri) : undefined));
}

export function importMalBatch(env: CloudflareEnv, items: MalImportItem[]): Promise<ImportItemResult[]> {
  return mapLimit(items, 2, (item) => importMalItem(env, item));
}
