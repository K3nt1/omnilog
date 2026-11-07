// Réglages : fuseau horaire (automatique d'après le navigateur, ou fixé), pays pour « Où regarder ».
import { CURRENT_USER_ID } from "./library";
import { validTimeZone } from "./local-time";

export interface Settings {
  timezone: string;
  /** Fuseau repris automatiquement du navigateur à chaque visite. */
  timezoneAuto: boolean;
  /** Pays pour « Où regarder » (code ISO à 2 lettres). */
  watchRegion: string;
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
    .prepare("SELECT timezone, timezone_auto, watch_region FROM users WHERE id = ?")
    .bind(CURRENT_USER_ID)
    .first<{ timezone: string; timezone_auto: number; watch_region: string }>();
  return {
    timezone: row?.timezone ?? "Europe/Paris",
    timezoneAuto: (row?.timezone_auto ?? 1) === 1,
    watchRegion: row?.watch_region ?? "FR",
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
