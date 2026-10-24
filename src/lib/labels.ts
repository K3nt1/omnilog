// Libellés et adresses partagés par toutes les pages (bibliothèque, pages par type, recherche).
import { LIBRARY_STATUSES, MEDIA_TYPES, type LibraryStatus, type MediaType } from "./types";

/** Nom au pluriel, pour les titres et les filtres. */
export const TYPE_LABELS: Record<MediaType, string> = {
  movie: "Films",
  tv: "Séries",
  anime: "Animés",
  manga: "Mangas",
  game: "Jeux",
};

/** Nom au singulier, pour la pastille sur une affiche. */
export const TYPE_SINGULAR: Record<MediaType, string> = {
  movie: "Film",
  tv: "Série",
  anime: "Animé",
  manga: "Manga",
  game: "Jeu",
};

/** Adresse de la page de chaque type : /films, /series… */
export const TYPE_SLUGS: Record<MediaType, string> = {
  movie: "films",
  tv: "series",
  anime: "animes",
  manga: "mangas",
  game: "jeux",
};

export function typeFromSlug(slug: string | undefined): MediaType | null {
  return MEDIA_TYPES.find((t) => TYPE_SLUGS[t] === slug) ?? null;
}

/** Valeur du statut dans l'adresse (?statut=…), indépendante du libellé affiché. */
export const STATUS_SLUGS: Record<LibraryStatus, string> = {
  planned: "prevu",
  in_progress: "en-cours",
  on_hold: "en-pause",
  completed: "termine",
  dropped: "abandonne",
};

export function statusFromSlug(slug: string | undefined): LibraryStatus | null {
  return LIBRARY_STATUSES.find((s) => STATUS_SLUGS[s] === slug) ?? null;
}

/** Ordre d'affichage des statuts dans les filtres. */
export const STATUS_ORDER: LibraryStatus[] = ["in_progress", "planned", "completed", "on_hold", "dropped"];

const PLANNED: Record<MediaType, string> = {
  movie: "À voir",
  tv: "À voir",
  anime: "À voir",
  manga: "À lire",
  game: "À jouer",
};

const COMPLETED: Record<MediaType, [singular: string, plural: string]> = {
  movie: ["Vu", "Vus"],
  tv: ["Vue", "Vues"],
  anime: ["Vu", "Vus"],
  manga: ["Lu", "Lus"],
  game: ["Joué", "Joués"],
};

/** Libellé d'un statut pour un type donné (« À lire », « Vus »…), ou tous types confondus si type = null. */
export function statusLabel(status: LibraryStatus, type: MediaType | null, plural = false): string {
  switch (status) {
    case "planned":
      return type ? PLANNED[type] : "Watchlist";
    case "in_progress":
      return "En cours";
    case "on_hold":
      return "En pause";
    case "completed":
      return type ? COMPLETED[type][plural ? 1 : 0] : plural ? "Terminés" : "Terminé";
    case "dropped":
      return plural ? "Abandonnés" : "Abandonné";
  }
}

/** Libellé du bouton d'ajout dans la recherche (« + À voir »…). */
export const plannedLabel = (type: MediaType) => PLANNED[type];

/** Note sur 10 (base) → « 4,5 » étoiles. */
export function starsLabel(rating: number | null): string | null {
  if (rating === null) return null;
  return (rating / 2).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** 4530 secondes → « 1:15:30 ». */
export function clockLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 135 minutes → « 2 h 15 ». */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** « 2025-10-12 » ou « 2025-10-12T20:00:00Z » → « 12 oct. 2025 ». */
export function dateLabel(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const COMPLETED_VERB: Record<MediaType, string> = { movie: "Vu", tv: "Vue", anime: "Vu", manga: "Lu", game: "Joué" };

/**
 * Ligne affichée sous une affiche selon le tri choisi (« Ajouté le 12 oct. 2025 », « Vu 3 fois »…).
 * null quand l'information est déjà visible (titre, année, note).
 */
export function sortDetail(sort: string, type: MediaType, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  switch (sort) {
    case "ajout":
      return `Ajouté le ${dateLabel(String(value))}`;
    case "activite":
      return `Activité : ${dateLabel(String(value))}`;
    case "fin":
      return `${COMPLETED_VERB[type]} le ${dateLabel(String(value))}`;
    case "visionnages":
      return `${COMPLETED_VERB[type]} ${value} fois`;
    case "duree": {
      const n = Number(value);
      if (type === "movie") return durationLabel(n);
      if (type === "game") return `≈ ${durationLabel(n)}`;
      if (type === "manga") return `${n} chapitre${n > 1 ? "s" : ""}`;
      return `${n} épisode${n > 1 ? "s" : ""}`;
    }
    default:
      return null;
  }
}

/**
 * Nom d'épisode à partir du titre Letterboxd (« Sherlock: The Great Game »),
 * sans le nom de la série quand il est en tête (« The Great Game »).
 */
export function episodeName(note: string, seriesTitles: (string | null)[]): string {
  const lower = note.toLowerCase();
  for (const title of seriesTitles) {
    if (!title) continue;
    const t = title.toLowerCase();
    if (lower.startsWith(t)) {
      const rest = note.slice(title.length).replace(/^\s*[:\-–—]\s*/, "").trim();
      if (rest) return rest;
    }
  }
  return note;
}

/** Adresse de la fiche d'une œuvre : /oeuvre/films/550 (le type dans l'adresse, l'identifiant de la source). */
export const ficheHref = (type: MediaType, externalId: string | null) =>
  externalId ? `/oeuvre/${TYPE_SLUGS[type]}/${externalId}` : `/${TYPE_SLUGS[type]}`;
