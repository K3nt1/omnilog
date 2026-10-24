// Types et constantes de la bibliothèque, utilisables côté serveur comme côté navigateur.
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
  search: string;
  sort: SortKey;
  direction: SortDirection;
  page: number;
}

/** Ce qu'affiche une vignette. */
export interface LibraryCard {
  entryId: number;
  mediaId: number;
  type: MediaType;
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
  pauseSeconds: number | null;
  pausePage: number | null;
  totalEpisodes: number | null;
  totalChapters: number | null;
  runtimeMinutes: number | null;
  isOngoing: boolean;
  /** Valeur du tri en cours (date d'ajout, nombre de visionnages…), affichée sous l'affiche. */
  sortValue?: string | number | null;
}

/** Tris proposés selon le type affiché (la durée n'a de sens qu'avec un seul type). */
export function sortsFor(type: MediaType | null): SortKey[] {
  return SORT_KEYS.filter((key) => {
    if (key === "duree") return type !== null;
    if (key === "visionnages") return type === null || type === "movie";
    return true;
  });
}
