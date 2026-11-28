// Types partagés entre le serveur (routes API) et l'interface.

export const MEDIA_TYPES = ["movie", "tv", "anime", "manga", "game", "comic"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_SOURCES = ["tmdb", "igdb", "mal", "comicvine", "manual"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const LIBRARY_STATUSES = ["planned", "in_progress", "on_hold", "completed", "dropped", "played", "wishlist"] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

/**
 * Statuts réservés aux jeux : « Joué » (joué sans être terminé) et « Envies » (pas encore à toi).
 * En base, ce sont un jeu terminé ou prévu précisé par `substatus` ; `list_status` donne le statut affiché.
 */
export const GAME_ONLY_STATUSES: readonly LibraryStatus[] = ["played", "wishlist"];

/** Statuts proposés pour un type (les statuts réservés aux jeux n'apparaissent que pour les jeux). */
export const statusesFor = (type: MediaType | null): LibraryStatus[] =>
  LIBRARY_STATUSES.filter((s) => type === "game" || type === null || !GAME_ONLY_STATUSES.includes(s));

/** Statut enregistré en base (`status`, `substatus`) pour un statut affiché. */
export function storedStatus(status: LibraryStatus): { status: Exclude<LibraryStatus, "played" | "wishlist">; substatus: "played" | "wishlist" | null } {
  if (status === "played") return { status: "completed", substatus: "played" };
  if (status === "wishlist") return { status: "planned", substatus: "wishlist" };
  return { status, substatus: null };
}

/** Quelle source fournit quel type de média. */
export const SOURCE_FOR_TYPE: Record<MediaType, MediaSource> = {
  movie: "tmdb",
  tv: "tmdb",
  anime: "mal",
  manga: "mal",
  game: "igdb",
  comic: "comicvine",
};

/** Œuvre ajoutée à la main (absente de sa source) : identifiant « m » suivi de chiffres, ex. « m173282018841 ». */
export function isManualId(externalId: string): boolean {
  return /^m\d{6,20}$/.test(externalId);
}

/** Identifiant accepté dans une adresse de fiche : celui de la source, ou d'une œuvre ajoutée à la main. */
export function isFicheId(externalId: string): boolean {
  return /^\d{1,12}$/.test(externalId) || isManualId(externalId);
}

/** Source d'une œuvre d'après son type et son identifiant (« manual » pour une œuvre ajoutée à la main). */
export function sourceOf(type: MediaType, externalId: string): MediaSource {
  return isManualId(externalId) ? "manual" : SOURCE_FOR_TYPE[type];
}

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
  /** Genres en français (« Science-Fiction »), pour filtrer les résultats. */
  genres: string[];
  /** Interne (retiré avant la réponse) : tous les titres connus, pour repérer les doublons entre sources. */
  matchTitles?: string[];
  /** Interne : film ou série TMDB d'animation japonaise (probablement aussi sur MyAnimeList). */
  animeLike?: boolean;
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
  /** Note TMDB de la saison sur 10 (fiche seulement, jamais enregistrée). */
  score?: number | null;
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
