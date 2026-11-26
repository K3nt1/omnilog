// Notes et critiques des saisons d'une série (migration 0021). Plusieurs par saison possibles (revisionnages).
// La note de la série reste indépendante : rien ici ne touche à library_entries.rating.
import type { JournalPatch } from "./journal";
import { CURRENT_USER_ID } from "./library";

export interface SeasonReviewLine {
  id: number;
  season: number;
  /** Date choisie (midi UTC), ou jour de l'ajout si « sans date ». */
  at: string;
  undated: boolean;
  rating: number | null;
  review: string | null;
  createdAt: string;
}

export interface SeasonReviewRow {
  id: number;
  season: number;
  logged_at: string;
  undated: number;
  rating: number | null;
  review: string | null;
  created_at: string;
}

export const toSeasonReviewLine = (r: SeasonReviewRow): SeasonReviewLine => ({
  id: r.id,
  season: r.season,
  at: r.logged_at,
  undated: r.undated === 1,
  rating: r.rating,
  review: r.review,
  createdAt: r.created_at,
});

/** Critiques de saison d'une œuvre (requête à mettre dans le lot de la fiche), la plus récente d'abord. */
export function seasonReviewsStatement(db: D1Database, source: string, externalId: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT r.id, r.season, r.logged_at, r.undated, r.rating, r.review, r.created_at
       FROM season_reviews r
       JOIN library_entries l ON l.id = r.entry_id JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.type = 'tv' AND m.source = ? AND m.external_id = ?
       ORDER BY r.logged_at DESC, r.id DESC LIMIT 200`,
    )
    .bind(CURRENT_USER_ID, source, externalId);
}

/** Midi UTC : la ligne reste sur son jour quel que soit le fuseau (comme le journal). */
const atDate = (date: string) => `${date}T12:00:00.000Z`;

export type SeasonReviewResult = "ok" | "not_found" | "empty";

/** Ajoute une note / critique à une saison d'une série de ta bibliothèque. */
export async function addSeasonReview(db: D1Database, entryId: number, season: number, patch: JournalPatch): Promise<SeasonReviewResult> {
  const rating = patch.rating ?? null;
  const review = patch.review?.trim() || null;
  if (rating === null && review === null) return "empty";
  const result = await db
    .prepare(
      `INSERT INTO season_reviews (entry_id, season, rating, review, logged_at, undated)
       SELECT l.id, ?, ?, ?, ?, ? FROM library_entries l WHERE l.id = ? AND l.user_id = ? AND l.media_type = 'tv'`,
    )
    .bind(season, rating, review, patch.date ? atDate(patch.date) : new Date().toISOString(), patch.date ? 0 : 1, entryId, CURRENT_USER_ID)
    .run();
  return result.meta.changes > 0 ? "ok" : "not_found";
}

/** Modifie la date (ou la retire), la note ou la critique d'une saison. */
export async function updateSeasonReview(db: D1Database, id: number, patch: JournalPatch): Promise<SeasonReviewResult> {
  const current = await db
    .prepare(
      `SELECT r.rating, r.review FROM season_reviews r JOIN library_entries l ON l.id = r.entry_id
       WHERE r.id = ? AND l.user_id = ?`,
    )
    .bind(id, CURRENT_USER_ID)
    .first<{ rating: number | null; review: string | null }>();
  if (!current) return "not_found";
  const rating = patch.rating !== undefined ? patch.rating : current.rating;
  const review = patch.review !== undefined ? patch.review?.trim() || null : current.review;
  if (rating === null && review === null) return "empty";
  const parts: [string, unknown][] = [
    ["rating = ?", rating],
    ["review = ?", review],
  ];
  if (patch.date === null) parts.push(["undated = ?", 1]);
  else if (patch.date !== undefined) parts.push(["logged_at = ?", atDate(patch.date)], ["undated = ?", 0]);
  await db
    .prepare(`UPDATE season_reviews SET ${parts.map(([sql]) => sql).join(", ")} WHERE id = ?`)
    .bind(...parts.map(([, value]) => value), id)
    .run();
  return "ok";
}

export async function deleteSeasonReview(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM season_reviews WHERE id = ?
         AND entry_id IN (SELECT l.id FROM library_entries l WHERE l.user_id = ?)`,
    )
    .bind(id, CURRENT_USER_ID)
    .run();
  return result.meta.changes > 0;
}
