// Tomes de manga : dernier chapitre d'un tome, d'après MangaDex, pour faire avancer le chapitre avec le tome.
import { CURRENT_USER_ID } from "./library";
import { mangadexIdFor } from "./release";
import { cached } from "./source-cache";
import { lastChapterOfVolume, volumeMap } from "./sources/mangadex";

/** Tomes et chapitres d'un manga MangaDex, gardés un jour (une seule requête par manga et par jour). */
async function cachedVolumeMap(db: D1Database, mangadexId: string): Promise<Map<string, number[]>> {
  const entries = await cached(db, `mangadex:tomes:${mangadexId}`, 24 * 3600_000, async () => [...(await volumeMap(mangadexId)).entries()]);
  return new Map(entries);
}

/** Manga MangaDex d'une entrée de ta bibliothèque, avec son tome en cours ; null si inconnu. */
async function entryManga(db: D1Database, entryId: number): Promise<{ mangadexId: string; currentVolume: number | null } | null> {
  const row = await db
    .prepare(
      `SELECT m.id, m.external_id, m.title, m.original_title, m.external_links_json, l.current_volume
       FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.id = ? AND l.user_id = ? AND m.type = 'manga'`,
    )
    .bind(entryId, CURRENT_USER_ID)
    .first<{ id: number; external_id: string | null; title: string; original_title: string | null; external_links_json: string | null; current_volume: number | null }>();
  if (!row || !row.external_id) return null;
  const links = row.external_links_json ? (JSON.parse(row.external_links_json) as Record<string, string>) : {};
  const id = await mangadexIdFor(db, {
    id: row.id,
    externalId: row.external_id,
    title: row.title,
    originalTitle: row.original_title,
    externalLinks: links,
  });
  return id ? { mangadexId: id, currentVolume: row.current_volume } : null;
}

/**
 * Dernier chapitre du tome `volume` (le tome en cours si absent) d'un manga de la bibliothèque.
 * null si MangaDex ne connaît pas ce tome ou ne répond pas : seul le compteur de tomes avance alors.
 */
export async function lastChapterOfEntryVolume(db: D1Database, entryId: number, volume?: number): Promise<number | null> {
  try {
    const manga = await entryManga(db, entryId);
    if (!manga) return null;
    return lastChapterOfVolume(await cachedVolumeMap(db, manga.mangadexId), volume ?? manga.currentVolume ?? 1);
  } catch (error) {
    console.error("Tomes MangaDex indisponibles", entryId, error);
    return null;
  }
}

export interface VolumeRange {
  volume: number;
  /** Premier et dernier chapitre du tome connus de MangaDex. */
  first: number;
  last: number;
}

/**
 * Tomes d'un manga de la bibliothèque, avec leurs chapitres (molette « où j'en suis »).
 * Les chapitres pas encore reliés à un tome (« none ») ne sont pas renvoyés. Liste vide si MangaDex ne sait pas.
 */
export async function entryVolumes(db: D1Database, entryId: number): Promise<VolumeRange[]> {
  const manga = await entryManga(db, entryId);
  if (!manga) return [];
  const map = await cachedVolumeMap(db, manga.mangadexId);
  const volumes: VolumeRange[] = [];
  for (const [key, chapters] of map) {
    const volume = Number(key);
    if (!Number.isInteger(volume) || volume < 1 || chapters.length === 0) continue;
    volumes.push({ volume, first: Math.min(...chapters), last: Math.max(...chapters) });
  }
  return volumes.sort((a, b) => a.volume - b.volume);
}
