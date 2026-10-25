// Journal : ajouter un visionnage (revu, relu, rejoué en entier), modifier ou supprimer une ligne.
import { CURRENT_USER_ID } from "./library";
import type { MediaType } from "./types";

export interface JournalPatch {
  date?: string; // AAAA-MM-JJ
  rating?: number | null; // 1 à 10
  review?: string | null;
  tags?: string[];
}

/** Ligne du journal à la date choisie (midi UTC, pour rester sur le bon jour quel que soit le fuseau). */
const atDate = (date: string) => `${date}T12:00:00.000Z`;

/**
 * Ajoute un visionnage complet : film vu (« revu le… »), ou série / animé / manga / jeu refait en entier.
 * Renvoie false si l'entrée n'existe pas.
 */
export async function addJournalLine(db: D1Database, entryId: number, patch: JournalPatch): Promise<boolean> {
  const entry = await db
    .prepare("SELECT media_type FROM library_entries WHERE id = ? AND user_id = ?")
    .bind(entryId, CURRENT_USER_ID)
    .first<{ media_type: MediaType }>();
  if (!entry) return false;
  await db
    .prepare(
      `INSERT INTO progress_log (entry_id, kind, logged_at, rating, review, tags_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entryId,
      entry.media_type === "movie" ? "movie" : "complete",
      patch.date ? atDate(patch.date) : new Date().toISOString(),
      patch.rating ?? null,
      patch.review?.trim() || null,
      patch.tags && patch.tags.length > 0 ? JSON.stringify(patch.tags) : null,
    )
    .run();
  return true;
}

/** Modifie la date, la note, la critique ou les tags d'une ligne. Renvoie false si elle n'existe pas. */
export async function updateJournalLine(db: D1Database, logId: number, patch: JournalPatch): Promise<boolean> {
  const parts: [string, unknown][] = [];
  if (patch.date !== undefined) parts.push(["logged_at = ?", atDate(patch.date)]);
  if (patch.rating !== undefined) parts.push(["rating = ?", patch.rating]);
  if (patch.review !== undefined) parts.push(["review = ?", patch.review?.trim() || null]);
  if (patch.tags !== undefined) parts.push(["tags_json = ?", patch.tags.length > 0 ? JSON.stringify(patch.tags) : null]);
  if (parts.length === 0) return true;
  const result = await db
    .prepare(
      `UPDATE progress_log SET ${parts.map(([sql]) => sql).join(", ")}
       WHERE id = ? AND entry_id IN (SELECT id FROM library_entries WHERE user_id = ?)`,
    )
    .bind(...parts.map(([, v]) => v), logId, CURRENT_USER_ID)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Supprime une ligne du journal. Une ligne importée (Letterboxd…) reviendrait si on réimporte le même export :
 * c'est voulu, l'export reste la référence de l'historique d'origine.
 */
export async function deleteJournalLine(db: D1Database, logId: number): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM progress_log WHERE id = ? AND entry_id IN (SELECT id FROM library_entries WHERE user_id = ?)")
    .bind(logId, CURRENT_USER_ID)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
