// Types et constantes de la bibliothèque, utilisables côté serveur comme côté navigateur.
import type { ReleaseInfo } from "./release-shared";
import type { LibraryStatus, MediaType } from "./types";

export const SORT_KEYS = ["activite", "ajout", "note", "titre", "sortie", "fin", "duree", "visionnages"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

/** Sens par défaut de chaque tri : A→Z pour le titre, du plus récent / plus grand au plus petit sinon. */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  activite: "desc",
  ajout: "desc",
  note: "desc",
  titre: "asc",
  sortie: "desc",
  fin: "desc",
  duree: "desc",
  visionnages: "desc",
};

/** « 4 » = 4 étoiles et plus ; « aucune » = pas encore noté. */
export const RATING_FILTERS = ["5", "4", "3", "2", "1", "aucune"] as const;
export type RatingFilter = (typeof RATING_FILTERS)[number];

export interface LibraryQuery {
  type: MediaType | null;
  status: LibraryStatus | null;
  favorite: boolean;
  rating: RatingFilter | null;
  /** Genre en français (« Science-Fiction »), voir genres.ts. */
  genre: string | null;
  /** Décennie de sortie (1970), puis éventuellement une année de cette décennie (1971). */
  decade: number | null;
  year: number | null;
  /** Année de visionnage / lecture / partie (journal daté, sinon date de fin). */
  watchYear: number | null;
  /** Encore en diffusion / en cours de publication. */
  ongoing: boolean;
  /** Avec une critique (sur l'œuvre ou sur une ligne du journal). */
  withReview: boolean;
  /** Tag d'une ligne du journal (« vo », « cinoche »…). */
  tag: string | null;
  /** Plateforme d'un jeu (abréviation IGDB : « PS5 », « PC »…). */
  platform: string | null;
  search: string;
  sort: SortKey;
  direction: SortDirection;
  page: number;
}

/** Valeurs proposées par un filtre, avec le nombre d'œuvres concernées (autres filtres appliqués). */
export interface Facet {
  value: string;
  count: number;
}

/** Affichage de la bibliothèque, mémorisé par navigateur (cookie). */
export type LibraryView = "grille" | "liste";
export type PosterSize = "petite" | "moyenne" | "grande";
export interface ViewPrefs {
  view: LibraryView;
  size: PosterSize;
}
export const VIEW_COOKIE = "omnilog_vue";
export const DEFAULT_VIEW: ViewPrefs = { view: "grille", size: "moyenne" };

/** Plus les affiches sont petites, plus il y en a par page. */
export function pageSizeFor(prefs: ViewPrefs): number {
  if (prefs.view === "liste") return 100;
  return prefs.size === "petite" ? 120 : prefs.size === "grande" ? 40 : 60;
}

/** Cookie « grille-petite » → préférences (valeurs inconnues ignorées). */
export function parseViewCookie(value: string | undefined): ViewPrefs {
  const [view, size] = (value ?? "").split("-");
  return {
    view: view === "liste" ? "liste" : "grille",
    size: size === "petite" || size === "grande" ? size : "moyenne",
  };
}

/** Ce qu'affiche une vignette. */
export interface LibraryCard {
  entryId: number;
  mediaId: number;
  type: MediaType;
  externalId: string | null;
  title: string;
  originalTitle: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  status: LibraryStatus;
  isFocus: boolean;
  isFavorite: boolean;
  rating: number | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  currentChapter: number | null;
  currentVolume: number | null;
  pauseSeconds: number | null;
  pausePage: number | null;
  totalEpisodes: number | null;
  totalChapters: number | null;
  runtimeMinutes: number | null;
  isOngoing: boolean;
  /** Valeur du tri en cours (date d'ajout, nombre de visionnages…), affichée sous l'affiche. */
  sortValue?: string | number | null;
  /** Tirée au sort (et pas encore commencée). */
  drawnAt: string | null;
  gameCheckpoint: string | null;
  playtimeMinutes: number | null;
  sessionsCount: number;
  /** Prochain épisode / dernier chapitre (œuvres en diffusion). */
  release: ReleaseInfo | null;
}

/** Tris proposés selon le type affiché (la durée n'a de sens qu'avec un seul type). */
export function sortsFor(type: MediaType | null): SortKey[] {
  return SORT_KEYS.filter((key) => {
    if (key === "duree") return type !== null;
    if (key === "visionnages") return true;
    return true;
  });
}
