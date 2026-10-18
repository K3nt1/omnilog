// Types partagés entre le serveur (routes API) et l'interface.

export const MEDIA_TYPES = ["movie", "tv", "anime", "manga", "game"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_SOURCES = ["tmdb", "igdb", "mal"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const LIBRARY_STATUSES = ["planned", "in_progress", "on_hold", "completed", "dropped"] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

/** Quelle source fournit quel type de média. */
export const SOURCE_FOR_TYPE: Record<MediaType, MediaSource> = {
  movie: "tmdb",
  tv: "tmdb",
  anime: "mal",
  manga: "mal",
  game: "igdb",
};

/** Résultat de recherche, identique quelle que soit la source. */
export interface SearchResult {
  key: string; // "type:source:externalId", unique dans une liste de résultats
  type: MediaType;
  source: MediaSource;
  externalId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  /** Statut dans ta bibliothèque si l'œuvre y est déjà, sinon null. */
  libraryStatus: LibraryStatus | null;
}

export interface SearchResponse {
  results: SearchResult[];
  /** Sources qui n'ont pas répondu : les résultats sont alors partiels. */
  errors: { source: MediaSource; message: string }[];
}

export interface SeasonInfo {
  seasonNumber: number;
  episodeCount: number;
  name: string | null;
  airDate: string | null;
}

/** Fiche complète d'une œuvre, récupérée au moment de l'ajout. */
export interface MediaDetails {
  type: MediaType;
  source: MediaSource;
  externalId: string;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null; // AAAA-MM-JJ
  runtimeMinutes: number | null;
  totalEpisodes: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  isOngoing: boolean;
  seasons: SeasonInfo[];
  extra: Record<string, unknown>;
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (MEDIA_TYPES as readonly string[]).includes(value);
}

export function isMediaSource(value: unknown): value is MediaSource {
  return typeof value === "string" && (MEDIA_SOURCES as readonly string[]).includes(value);
}

export function isLibraryStatus(value: unknown): value is LibraryStatus {
  return typeof value === "string" && (LIBRARY_STATUSES as readonly string[]).includes(value);
}

export function resultKey(type: MediaType, source: MediaSource, externalId: string): string {
  return `${type}:${source}:${externalId}`;
}

/** "2021-10-22" -> 2021 ; null si absent ou invalide. */
export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}
