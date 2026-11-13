// Réglages : fuseau horaire (automatique d'après le navigateur, ou fixé), pays pour « Où regarder »,
// contenu pour adultes dans la recherche, tri par défaut de chaque page.
import { SORT_KEYS, sortsFor, type DefaultSorts, type SortKey } from "./browse-shared";
import { CURRENT_USER_ID } from "./library";
import { MEDIA_TYPES, type MediaType } from "./types";
import { validTimeZone } from "./local-time";

export interface Settings {
  timezone: string;
  /** Fuseau repris automatiquement du navigateur à chaque visite. */
  timezoneAuto: boolean;
  /** Pays pour « Où regarder » (code ISO à 2 lettres). */
  watchRegion: string;
  /** Inclure le contenu pour adultes dans la recherche (MyAnimeList l'écarte par défaut). */
  searchAdult: boolean;
  /** Tri par défaut de la bibliothèque (« all ») et de chaque page de type ; absent = « Dernière activité ». */
  defaultSorts: DefaultSorts;
}

/** Tris par défaut valides seulement (type connu, tri proposé pour ce type, sens asc / desc). */
export function cleanDefaultSorts(value: unknown): DefaultSorts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: DefaultSorts = {};
  for (const [key, choice] of Object.entries(value as Record<string, unknown>)) {
    if (key !== "all" && !(MEDIA_TYPES as readonly string[]).includes(key)) return null;
    if (choice === null) continue; // retour au tri habituel
    const c = choice as { sort?: unknown; direction?: unknown };
    const type = key === "all" ? null : (key as MediaType);
    if (!(SORT_KEYS as readonly string[]).includes(String(c.sort)) || !sortsFor(type).includes(c.sort as SortKey)) return null;
    if (c.direction !== "asc" && c.direction !== "desc") return null;
    result[key as MediaType | "all"] = { sort: c.sort as SortKey, direction: c.direction };
  }
  return result;
}

/** Pays proposés pour « Où regarder » (JustWatch via TMDB). */
export const REGIONS: [code: string, name: string][] = [
  ["FR", "France"],
  ["CY", "Chypre"],
  ["BE", "Belgique"],
  ["CH", "Suisse"],
  ["CA", "Canada"],
  ["LU", "Luxembourg"],
  ["GB", "Royaume-Uni"],
  ["US", "États-Unis"],
  ["DE", "Allemagne"],
  ["ES", "Espagne"],
  ["IT", "Italie"],
  ["GR", "Grèce"],
  ["JP", "Japon"],
];

export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db
    .prepare("SELECT timezone, timezone_auto, watch_region, search_adult, default_sorts_json FROM users WHERE id = ?")
    .bind(CURRENT_USER_ID)
    .first<{ timezone: string; timezone_auto: number; watch_region: string; search_adult: number; default_sorts_json: string | null }>();
  let defaultSorts: DefaultSorts = {};
  try {
    defaultSorts = cleanDefaultSorts(JSON.parse(row?.default_sorts_json ?? "{}")) ?? {};
  } catch {
    // JSON abîmé : tris habituels
  }
  return {
    timezone: row?.timezone ?? "Europe/Paris",
    timezoneAuto: (row?.timezone_auto ?? 1) === 1,
    watchRegion: row?.watch_region ?? "FR",
    searchAdult: row?.search_adult === 1,
    defaultSorts,
  };
}

/** Vérifie et applique des réglages ; renvoie un message d'erreur ou null. */
export async function updateSettings(db: D1Database, patch: Partial<Settings>): Promise<string | null> {
  const parts: [string, unknown][] = [];
  if (patch.timezone !== undefined) {
    const tz = validTimeZone(patch.timezone);
    if (!tz) return "Fuseau horaire inconnu.";
    parts.push(["timezone = ?", tz]);
  }
  if (patch.timezoneAuto !== undefined) parts.push(["timezone_auto = ?", patch.timezoneAuto ? 1 : 0]);
  if (patch.watchRegion !== undefined) {
    if (!/^[A-Z]{2}$/.test(patch.watchRegion)) return "Pays invalide.";
    parts.push(["watch_region = ?", patch.watchRegion]);
  }
  if (patch.searchAdult !== undefined) parts.push(["search_adult = ?", patch.searchAdult ? 1 : 0]);
  if (patch.defaultSorts !== undefined) {
    const sorts = cleanDefaultSorts(patch.defaultSorts);
    if (!sorts) return "Tri par défaut invalide.";
    parts.push(["default_sorts_json = ?", Object.keys(sorts).length > 0 ? JSON.stringify(sorts) : null]);
  }
  if (parts.length > 0) {
    await db
      .prepare(`UPDATE users SET ${parts.map(([s]) => s).join(", ")} WHERE id = ?`)
      .bind(...parts.map(([, v]) => v), CURRENT_USER_ID)
      .run();
  }
  return null;
}

/** Fuseau du navigateur : enregistré seulement en mode automatique et s'il a changé (aucune écriture sinon). */
export async function syncBrowserTimeZone(db: D1Database, timezone: string): Promise<boolean> {
  const tz = validTimeZone(timezone);
  if (!tz) return false;
  const result = await db
    .prepare("UPDATE users SET timezone = ? WHERE id = ? AND timezone_auto = 1 AND timezone <> ?")
    .bind(tz, CURRENT_USER_ID, tz)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
