// Bilan de l'année : types et petits calculs partagés entre le serveur, la page et l'export en image.
import type { MediaType } from "./types";

export interface BilanWork {
  entryId: number;
  type: MediaType;
  title: string;
  posterUrl: string | null;
  href: string;
  rating: number | null; // 1 à 10
}

/** Saison notée dans l'année (séries). */
export interface BilanSeason {
  work: BilanWork;
  season: number;
  /** Nom TMDB de la saison, s'il est connu. */
  name: string | null;
  rating: number; // 1 à 10
}

export interface BilanStreak {
  days: number;
  from: string | null; // AAAA-MM-JJ
  to: string | null;
}

export interface BilanType {
  type: MediaType;
  /** Activités datées de l'année (épisodes, chapitres, sessions, films, fins…). */
  activities: number;
  /** Œuvres différentes avec au moins une activité. */
  works: number;
  /** Minutes : films, séries, animes (durée de l'épisode), jeux (sessions). Null pour la lecture. */
  minutes: number | null;
  /** Épisodes ou films sans durée connue (comptés sans heures). */
  missingDurations: number;
  units: { movies: number; episodes: number; chapters: number; volumes: number; sessions: number };
  /** Œuvres terminées dans l'année (jeux « Joué » exclus). */
  completed: number;
  /** Top des œuvres notées actives dans l'année (5 au plus), meilleure d'abord. */
  top: BilanWork[];
  worst: BilanWork | null;
  /** Séries : les 5 saisons les mieux notées dans l'année (absent des bilans gardés en cache avant la 0.13). */
  topSeasons?: BilanSeason[];
  streak: BilanStreak;
  first: { work: BilanWork; day: string } | null;
  last: { work: BilanWork; day: string } | null;
  /** Revisionnages / relectures / parties rejouées : activités déjà faites avant, et œuvres concernées. */
  again: { activities: number; works: BilanWork[] };
}

export interface BilanData {
  year: number;
  types: BilanType[]; // seulement les types avec de l'activité, dans l'ordre MEDIA_TYPES
  totals: { activities: number; works: number; completed: number; activeDays: number; minutes: number };
  streak: BilanStreak;
  /** Activités par mois (0 = janvier) et par type. */
  months: Record<MediaType, number>[];
  busiestMonth: { month: number; activities: number } | null; // 0 = janvier
  busiestWeekday: { weekday: number; activities: number } | null; // 0 = lundi
  weekdays: number[]; // lundi → dimanche
}

export const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Couleur de chaque type (graphique, image exportée). */
export const TYPE_HEX: Record<MediaType, string> = {
  movie: "#fbbf24",
  tv: "#38bdf8",
  anime: "#a78bfa",
  manga: "#f472b6",
  game: "#34d399",
  comic: "#f87171",
};

/** « 132 h », « 45 min ». */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60).toLocaleString("fr-FR")} h`;
}

/** Le bilan de l'année en cours s'ouvre le 31 décembre ; les années passées sont toujours ouvertes. */
export function bilanOpen(year: number, today: string): boolean {
  const current = Number(today.slice(0, 4));
  return year < current || (year === current && today >= `${year}-12-31`);
}

/** Dernière année dont le bilan est ouvert. */
export const latestBilanYear = (today: string) => (bilanOpen(Number(today.slice(0, 4)), today) ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1);

/** Plus longue suite de jours consécutifs, avec ses dates. */
export function streakOf(days: Iterable<string>): BilanStreak {
  const sorted = [...new Set(days)].sort();
  let best: BilanStreak = { days: 0, from: null, to: null };
  let start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const consecutive = i > 0 && Date.parse(`${sorted[i]}T00:00:00Z`) - Date.parse(`${sorted[i - 1]}T00:00:00Z`) === 86400_000;
    if (!consecutive) start = i;
    const length = i - start + 1;
    if (length > best.days) best = { days: length, from: sorted[start], to: sorted[i] };
  }
  return best;
}

/** Lundi = 0 … dimanche = 6. */
export const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** « 12 janv. » */
export const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}`;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

/** Ce qui a été fait, en unités du type : « 3 films », « 42 épisodes », « 12 sessions », « 310 chapitres · 4 tomes ». */
export function unitsLabel(t: Pick<BilanType, "type" | "units">): string {
  const u = t.units;
  switch (t.type) {
    case "movie":
      return plural(u.movies, "film", "films");
    case "tv":
    case "anime":
      return plural(u.episodes, "épisode", "épisodes");
    case "game":
      return plural(u.sessions, "session", "sessions");
    case "comic":
      return plural(u.chapters, "numéro", "numéros");
    case "manga":
      return [u.chapters > 0 || u.volumes === 0 ? plural(u.chapters, "chapitre", "chapitres") : null, u.volumes > 0 ? plural(u.volumes, "tome", "tomes") : null]
        .filter(Boolean)
        .join(" · ");
  }
}

/** Chiffre principal d'un type : les heures, ou le nombre de chapitres / numéros pour la lecture. */
export function mainFigure(t: Pick<BilanType, "type" | "units" | "minutes">): { value: string; label: string } {
  if (t.minutes !== null && t.minutes > 0) return { value: hoursLabel(t.minutes), label: unitsLabel(t) };
  if (t.type === "comic") return { value: t.units.chapters.toLocaleString("fr-FR"), label: t.units.chapters > 1 ? "numéros lus" : "numéro lu" };
  if (t.type === "manga") {
    const n = t.units.chapters || t.units.volumes;
    return { value: n.toLocaleString("fr-FR"), label: t.units.chapters ? (n > 1 ? "chapitres lus" : "chapitre lu") : n > 1 ? "tomes lus" : "tome lu" };
  }
  return { value: unitsLabel(t).split(" ")[0], label: unitsLabel(t).split(" ").slice(1).join(" ") };
}

export const AGAIN_LABEL: Record<MediaType, string> = { movie: "revus", tv: "revus", anime: "revus", manga: "relus", game: "rejoués", comic: "relus" };
