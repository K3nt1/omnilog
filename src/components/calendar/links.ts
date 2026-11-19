// Adresse du calendrier : vue, mois / année, jour choisi et filtres (rien n'est écrit quand c'est la valeur par défaut).
import type { CalendarAction } from "@/lib/calendar-shared";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";

export interface CalendarState {
  view: "mois" | "annee";
  month: string;
  year: number;
  day: string | null;
  types: MediaType[];
  action: CalendarAction;
}

export function calendarHref(state: CalendarState, change: Partial<CalendarState> = {}): string {
  const next = { ...state, ...change };
  const params = new URLSearchParams();
  if (next.view === "annee") {
    params.set("vue", "annee");
    params.set("annee", String(next.year));
  } else {
    params.set("mois", next.month);
    if (next.day) params.set("jour", next.day);
    if (next.action !== "tout") params.set("action", next.action);
  }
  if (next.types.length < MEDIA_TYPES.length) params.set("types", next.types.join(","));
  return `/calendrier?${params}`;
}

/** Ajoute ou retire un type du filtre (tous retirés = tous affichés). */
export function toggleType(types: MediaType[], type: MediaType): MediaType[] {
  if (types.length === MEDIA_TYPES.length) return [type];
  const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
  return next.length === 0 ? [...MEDIA_TYPES] : MEDIA_TYPES.filter((t) => next.includes(t));
}

/** Couleur de chaque type (pastilles, filtres). */
export const TYPE_COLORS: Record<MediaType, string> = {
  movie: "bg-amber-400",
  tv: "bg-sky-400",
  anime: "bg-violet-400",
  manga: "bg-pink-400",
  game: "bg-emerald-400",
  comic: "bg-red-400",
};
export const TYPE_TEXT: Record<MediaType, string> = {
  movie: "text-amber-300",
  tv: "text-sky-300",
  anime: "text-violet-300",
  manga: "text-pink-300",
  game: "text-emerald-300",
  comic: "text-red-300",
};
