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
}

export type ImportRequest =
  | { source: "mal"; items: MalImportItem[] }
  | { source: "letterboxd"; items: LetterboxdFilm[] };

// ---------- Réponse ----------

export interface MatchCandidate {
  tmdbId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
}

export type ImportItemStatus = "imported" | "updated" | "ambiguous" | "not_found" | "error";

export interface ImportItemResult {
  key: string;
  label: string;
  status: ImportItemStatus;
  message?: string;
  candidates?: MatchCandidate[];
}

export interface ImportResponse {
  results: ImportItemResult[];
}
