// Tomes de manga : dernier chapitre d'un tome, d'après MangaDex, pour faire avancer le chapitre avec le tome.
import { CURRENT_USER_ID } from "./library";
import { mangadexIdFor } from "./release";
import { lastChapterOfVolume, volumeMap } from "./sources/mangadex";

/**
 * Dernier chapitre du tome `volume` (le tome en cours si absent) d'un manga de la bibliothèque.
 * null si MangaDex ne connaît pas ce tome ou ne répond pas : seul le compteur de tomes avance alors.
 */
export async function lastChapterOfEntryVolume(db: D1Database, entryId: number, volume?: number): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT m.id, m.external_id, m.title, m.original_title, m.external_links_json, l.current_volume
       FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.id = ? AND l.user_id = ? AND m.type = 'manga'`,
    )
    .bind(entryId, CURRENT_USER_ID)
    .first<{ id: number; external_id: string | null; title: string; original_title: string | null; external_links_json: string | null; current_volume: number | null }>();
  if (!row || !row.external_id) return null;
  try {
    const links = row.external_links_json ? (JSON.parse(row.external_links_json) as Record<string, string>) : {};
    const id = await mangadexIdFor(db, {
      id: row.id,
      externalId: row.external_id,
      title: row.title,
      originalTitle: row.original_title,
      externalLinks: links,
    });
    if (!id) return null;
    return lastChapterOfVolume(await volumeMap(id), volume ?? row.current_volume ?? 1);
  } catch (error) {
    console.error("Tomes MangaDex indisponibles", entryId, error);
    return null;
  }
}
