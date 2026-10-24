// Format des données échangées entre la page d'import (navigateur) et /api/import.
import type { LibraryStatus } from "../types";

/** Taille des paquets envoyés au serveur (limites des Workers gratuits : 50 appels sortants et 50 requêtes D1). */
export const IMPORT_BATCH_SIZE = { mal: 8, letterboxd: 5 } as const;

// ---------- MyAnimeList ----------

export interface MalImportItem {
  key: string; // "mal:anime:52991"
  kind: "anime" | "manga";
  malId: string;
  title: string;
  status: LibraryStatus;
  score: number | null; // 1 à 10
  progress: number; // épisodes vus / chapitres lus
  total: number | null; // total connu dans l'export
  startDate: string | null; // AAAA-MM-JJ
  finishDate: string | null;
}

// ---------- Letterboxd ----------

/** Une entrée du journal Letterboxd (un visionnage daté). */
export interface LetterboxdWatch {
  ref: string; // lien boxd.it de l'entrée, ou identifiant construit pour les orphelins
  watchedDate: string | null; // AAAA-MM-JJ
  rating: number | null; // 0,5 à 5 étoiles
  rewatch: boolean;
  tags: string[];
  review: string | null; // HTML d'origine conservé
}

export interface LetterboxdFilm {
  key: string; // "lb:https://boxd.it/2aIU"
  uri: string | null; // lien boxd.it du film (null pour les entrées orphelines)
  name: string;
  year: number | null;
  status: "completed" | "planned";
  rating: number | null; // 0,5 à 5 étoiles
  liked: boolean;
  addedDate: string | null; // date d'ajout sur Letterboxd
  watches: LetterboxdWatch[];
  /** Choix manuel fait dans l'écran de validation. */
  forceTmdbId?: string;
  /** Type de la fiche choisie : une entrée Letterboxd peut correspondre à une série chez TMDB. */
  forceType?: "movie" | "tv";
  /** Accepter que ce film rejoigne une fiche déjà associée à une autre entrée Letterboxd. */
  allowMerge?: boolean;
}

/** Clé d'une entrée Letterboxd dans import_links : lien du film, ou clé construite pour les orphelins. */
export const letterboxdLinkKey = (film: Pick<LetterboxdFilm, "uri" | "key">) => film.uri ?? film.key;

export type ImportRequest =
  | { source: "mal"; items: MalImportItem[] }
  | { source: "letterboxd"; items: LetterboxdFilm[] };

// ---------- Réponse ----------

export interface MatchCandidate {
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
}

export type ImportItemStatus = "imported" | "updated" | "ambiguous" | "not_found" | "conflict" | "error";

export interface ImportItemResult {
  key: string;
  label: string;
  status: ImportItemStatus;
  message?: string;
  candidates?: MatchCandidate[];
  /** Fiche TMDB retenue (ou en conflit). */
  tmdbId?: string;
  tmdbType?: "movie" | "tv";
  /** Conflit : clé de l'autre entrée Letterboxd déjà associée à cette fiche. */
  conflictWith?: string;
}

export interface ImportCheckResponse {
  missing: string[]; // clés import_links absentes de la base
}

/** Nombre maximum de clés vérifiées par appel à /api/import/check. */
export const IMPORT_CHECK_CHUNK = 450;

export interface ImportResponse {
  results: ImportItemResult[];
}

/** Dates d'ajout corrigées par appel : une requête D1 chacune, sous la limite de 50 par appel (plan gratuit). */
export const IMPORT_DATES_CHUNK = 45;
