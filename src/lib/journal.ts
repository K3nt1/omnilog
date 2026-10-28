// Journal : ajouter un visionnage (revu, relu, rejoué en entier), modifier ou supprimer une ligne.
import { CURRENT_USER_ID } from "./library";
import { nextTvEpisode } from "./progress";
import type { LibraryStatus, MediaType } from "./types";

export interface JournalPatch {
  /** AAAA-MM-JJ, ou null pour « sans date » (le visionnage garde le jour de l'ajout, comme sur Letterboxd). */
  date?: string | null;
  rating?: number | null; // 1 à 10
  review?: string | null;
  tags?: string[];
}

/**
 * Note de l'œuvre = note du visionnage complet le plus récent qui en a une (comme Letterboxd).
 * Sans aucun visionnage noté, la note actuelle reste (elle peut venir d'un import sans journal).
 */
function syncRating(db: D1Database, entryId: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE library_entries SET rating = (
         SELECT rating FROM progress_log WHERE entry_id = ?1 AND kind IN ('movie', 'complete') AND rating IS NOT NULL
         ORDER BY logged_at DESC, id DESC LIMIT 1)
       WHERE id = ?1 AND EXISTS (
         SELECT 1 FROM progress_log WHERE entry_id = ?1 AND kind IN ('movie', 'complete') AND rating IS NOT NULL)`,
    )
    .bind(entryId);
}

/** Ligne du journal à la date choisie (midi UTC, pour rester sur le bon jour quel que soit le fuseau). */
const atDate = (date: string) => `${date}T12:00:00.000Z`;

export interface AddResult {
  /** L'œuvre vient de passer en vue / lue / jouée. */
  completed: boolean;
  wasFocus: boolean;
  type: MediaType;
  externalId: string | null;
}

/**
 * Ajoute un visionnage complet : film vu (« revu le… »), ou série / anime / manga / jeu refait en entier.
 * L'œuvre passe en vue / lue / jouée si elle ne l'était pas (date de fin = date du visionnage s'il en a une),
 * sa pause s'efface et elle quitte le focus. Renvoie null si l'entrée n'existe pas.
 */
export async function addJournalLine(db: D1Database, entryId: number, patch: JournalPatch): Promise<AddResult | null> {
  const entry = await db
    .prepare(
      `SELECT l.media_type, l.status, m.external_id, EXISTS (SELECT 1 FROM focus f WHERE f.entry_id = l.id) AS is_focus
       FROM library_entries l JOIN media m ON m.id = l.media_id WHERE l.id = ? AND l.user_id = ?`,
    )
    .bind(entryId, CURRENT_USER_ID)
    .first<{ media_type: MediaType; status: LibraryStatus; external_id: string | null; is_focus: number }>();
  if (!entry) return null;
  const undated = !patch.date;
  const completes = entry.status !== "completed";
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO progress_log (entry_id, kind, logged_at, rating, review, tags_json, undated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entryId,
        entry.media_type === "movie" ? "movie" : "complete",
        patch.date ? atDate(patch.date) : new Date().toISOString(),
        patch.rating ?? null,
        patch.review?.trim() || null,
        patch.tags && patch.tags.length > 0 ? JSON.stringify(patch.tags) : null,
        undated ? 1 : 0,
      ),
  ];
  if (completes) {
    statements.push(
      db
        .prepare(
          `UPDATE library_entries SET status = 'completed', pause_seconds = NULL, pause_page = NULL, drawn_at = NULL,
                  completed_at = COALESCE(?, completed_at)
           WHERE id = ?`,
        )
        .bind(patch.date ?? null, entryId),
      db.prepare("DELETE FROM focus WHERE entry_id = ?").bind(entryId),
    );
  }
  statements.push(syncRating(db, entryId));
  await db.batch(statements);
  return { completed: completes, wasFocus: entry.is_focus === 1, type: entry.media_type, externalId: entry.external_id };
}

/** Modifie la date (ou la retire), la note, la critique ou les tags d'une ligne. Renvoie false si elle n'existe pas. */
export async function updateJournalLine(db: D1Database, logId: number, patch: JournalPatch): Promise<boolean> {
  const parts: [string, unknown][] = [];
  if (patch.date === null) parts.push(["undated = ?", 1]);
  else if (patch.date !== undefined) parts.push(["logged_at = ?", atDate(patch.date)], ["undated = ?", 0]);
  if (patch.rating !== undefined) parts.push(["rating = ?", patch.rating]);
  if (patch.review !== undefined) parts.push(["review = ?", patch.review?.trim() || null]);
  if (patch.tags !== undefined) parts.push(["tags_json = ?", patch.tags.length > 0 ? JSON.stringify(patch.tags) : null]);
  if (parts.length === 0) return true;
  const line = await db
    .prepare(
      `SELECT p.entry_id FROM progress_log p JOIN library_entries l ON l.id = p.entry_id WHERE p.id = ? AND l.user_id = ?`,
    )
    .bind(logId, CURRENT_USER_ID)
    .first<{ entry_id: number }>();
  if (!line) return false;
  await db.batch([
    db.prepare(`UPDATE progress_log SET ${parts.map(([sql]) => sql).join(", ")} WHERE id = ?`).bind(...parts.map(([, v]) => v), logId),
    // La note ou la date a pu changer : la note de l'œuvre suit le visionnage noté le plus récent.
    syncRating(db, line.entry_id),
  ]);
  return true;
}

/**
 * Supprime une ligne du journal. Pour un épisode de série, la position est recalculée : juste après le dernier
 * épisode encore coché (S01E01 s'il n'en reste aucun), et la série repasse « en cours » si elle était terminée.
 * Une ligne importée (Letterboxd…) reviendrait si on réimporte le même export : l'export reste la référence.
 */
export async function deleteJournalLine(db: D1Database, logId: number): Promise<boolean> {
  const line = await db
    .prepare(
      `SELECT p.entry_id, p.kind, p.season, p.episode, p.rating, l.media_type, l.status, l.rating AS entry_rating
       FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
       WHERE p.id = ? AND l.user_id = ?`,
    )
    .bind(logId, CURRENT_USER_ID)
    .first<{
      entry_id: number;
      kind: string;
      season: number | null;
      episode: number | null;
      rating: number | null;
      media_type: MediaType;
      status: LibraryStatus;
      entry_rating: number | null;
    }>();
  if (!line) return false;
  const statements = [db.prepare("DELETE FROM progress_log WHERE id = ?").bind(logId), syncRating(db, line.entry_id)];
  if (line.kind === "movie" || line.kind === "complete") {
    // C'était le dernier visionnage noté et la note de l'œuvre venait de lui : la note s'efface.
    if (line.rating !== null && line.rating === line.entry_rating) {
      statements.push(
        db
          .prepare(
            `UPDATE library_entries SET rating = NULL WHERE id = ?1 AND NOT EXISTS (
               SELECT 1 FROM progress_log WHERE entry_id = ?1 AND kind IN ('movie', 'complete') AND rating IS NOT NULL)`,
          )
          .bind(line.entry_id),
      );
    }
    // Plus aucun visionnage complet : l'œuvre n'est plus vue / lue / jouée (l'inverse de l'ajout).
    // Film → watchlist ; autre type → en cours s'il reste de la progression, sinon watchlist / backlog.
    // Sinon la date de fin suit le visionnage complet daté le plus récent (inchangée s'il n'y en a aucun de daté).
    statements.push(
      db
        .prepare(
          `UPDATE library_entries SET
             status = CASE WHEN status <> 'completed' OR EXISTS (
                 SELECT 1 FROM progress_log WHERE entry_id = ?1 AND kind IN ('movie', 'complete')) THEN status
               WHEN EXISTS (SELECT 1 FROM progress_log WHERE entry_id = ?1 AND kind NOT IN ('movie', 'complete', 'pause'))
                 THEN 'in_progress'
               ELSE 'planned' END,
             completed_at = CASE WHEN NOT EXISTS (
                 SELECT 1 FROM progress_log WHERE entry_id = ?1 AND kind IN ('movie', 'complete')) THEN NULL
               ELSE COALESCE((SELECT substr(logged_at, 1, 10) FROM progress_log
                 WHERE entry_id = ?1 AND kind IN ('movie', 'complete') AND undated = 0 ORDER BY logged_at DESC LIMIT 1),
                 completed_at) END
           WHERE id = ?1 AND status = 'completed'`,
        )
        .bind(line.entry_id),
    );
  }
  await db.batch(statements);
  if (line.media_type === "tv" && line.kind === "episode" && line.season !== null && line.episode !== null) {
    await recomputeTvPosition(db, line.entry_id, line.status);
  }
  return true;
}

/** Position d'une série = épisode suivant le dernier coché (par numéro de saison puis d'épisode). */
async function recomputeTvPosition(db: D1Database, entryId: number, status: LibraryStatus): Promise<void> {
  const [lastRows, seasonRows, countRows] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT season, episode FROM progress_log
         WHERE entry_id = ? AND kind = 'episode' AND season > 0 AND episode IS NOT NULL
         ORDER BY season DESC, episode DESC LIMIT 1`,
      )
      .bind(entryId),
    db
      .prepare(
        `SELECT s.season_number, s.episode_count FROM media_seasons s JOIN library_entries l ON l.media_id = s.media_id
         WHERE l.id = ? AND s.season_number > 0 AND s.episode_count > 0 ORDER BY s.season_number`,
      )
      .bind(entryId),
    db.prepare("SELECT COUNT(*) AS n FROM progress_log WHERE entry_id = ? AND kind <> 'pause'").bind(entryId),
  ]);
  const last = lastRows.results[0] as { season: number; episode: number } | undefined;
  const seasons = (seasonRows.results as { season_number: number; episode_count: number }[]).map((s) => ({
    season: s.season_number,
    episodes: s.episode_count,
  }));
  const next = last ? (nextTvEpisode(seasons, last.season, last.episode) ?? { season: last.season, episode: last.episode + 1 }) : null;
  const remaining = (countRows.results[0] as { n: number }).n;
  // Plus aucun visionnage : retour dans la watchlist ; sinon « en cours » (même si elle était terminée).
  const nextStatus: LibraryStatus = remaining === 0 && status === "in_progress" ? "planned" : status === "completed" ? "in_progress" : status;
  await db
    .prepare(
      `UPDATE library_entries SET current_season = ?, current_episode = ?, status = ?,
              completed_at = CASE WHEN ? = 'completed' THEN completed_at ELSE NULL END
       WHERE id = ?`,
    )
    .bind(next?.season ?? null, next?.episode ?? null, nextStatus, nextStatus, entryId)
    .run();
}
