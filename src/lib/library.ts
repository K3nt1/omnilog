// Accès à la base D1 pour la bibliothèque.
import type { LibraryStatus, MediaDetails, SearchResult } from "./types";
import { resultKey, type MediaSource, type MediaType } from "./types";

/** Utilisateur unique pour l'instant (créé par la migration 0002). */
export const CURRENT_USER_ID = 1;

/** Renvoie, pour chaque résultat déjà dans ta bibliothèque, son statut. */
export async function findLibraryStatuses(
  db: D1Database,
  results: SearchResult[],
): Promise<Map<string, LibraryStatus>> {
  const statuses = new Map<string, LibraryStatus>();
  const ids = [...new Set(results.map((r) => r.externalId))];
  if (ids.length === 0) return statuses;

  const placeholders = ids.map(() => "?").join(", ");
  const { results: rows } = await db
    .prepare(
      `SELECT m.type, m.source, m.external_id, l.status
       FROM library_entries l
       JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.external_id IN (${placeholders})`,
    )
    .bind(CURRENT_USER_ID, ...ids)
    .all<{ type: MediaType; source: MediaSource; external_id: string; status: LibraryStatus }>();

  for (const row of rows) {
    statuses.set(resultKey(row.type, row.source, row.external_id), row.status);
  }
  return statuses;
}

export interface AddResult {
  entryId: number;
  mediaId: number;
  created: boolean; // false = l'œuvre était déjà dans ta bibliothèque
  status: LibraryStatus;
}

/**
 * Enregistre (ou rafraîchit) l'œuvre dans le catalogue, ses saisons pour une série,
 * puis l'ajoute à ta bibliothèque si elle n'y est pas déjà.
 */
export async function addToLibrary(
  db: D1Database,
  details: MediaDetails,
  status: LibraryStatus,
): Promise<AddResult> {
  const media = await db
    .prepare(
      `INSERT INTO media (type, source, external_id, title, original_title, overview, poster_url, backdrop_url,
                          release_date, runtime_minutes, total_episodes, total_chapters, total_volumes,
                          is_ongoing, extra_json, fetched_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       ON CONFLICT (type, source, external_id) DO UPDATE SET
         title = excluded.title, original_title = excluded.original_title, overview = excluded.overview,
         poster_url = excluded.poster_url, backdrop_url = excluded.backdrop_url,
         release_date = excluded.release_date, runtime_minutes = excluded.runtime_minutes,
         total_episodes = excluded.total_episodes, total_chapters = excluded.total_chapters,
         total_volumes = excluded.total_volumes, is_ongoing = excluded.is_ongoing,
         extra_json = excluded.extra_json, fetched_at = excluded.fetched_at
       RETURNING id`,
    )
    .bind(
      details.type,
      details.source,
      details.externalId,
      details.title,
      details.originalTitle,
      details.overview,
      details.posterUrl,
      details.backdropUrl,
      details.releaseDate,
      details.runtimeMinutes,
      details.totalEpisodes,
      details.totalChapters,
      details.totalVolumes,
      details.isOngoing ? 1 : 0,
      JSON.stringify(details.extra),
      new Date().toISOString(),
    )
    .first<{ id: number }>();

  if (!media) throw new Error("Impossible d'enregistrer l'œuvre dans le catalogue");

  if (details.seasons.length > 0) {
    const upsertSeason = db.prepare(
      `INSERT INTO media_seasons (media_id, season_number, episode_count, name, air_date)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (media_id, season_number) DO UPDATE SET
         episode_count = excluded.episode_count, name = excluded.name, air_date = excluded.air_date`,
    );
    await db.batch(
      details.seasons.map((s) => upsertSeason.bind(media.id, s.seasonNumber, s.episodeCount, s.name, s.airDate)),
    );
  }

  const inserted = await db
    .prepare(
      `INSERT INTO library_entries (user_id, media_id, media_type, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, media_id) DO NOTHING
       RETURNING id, status`,
    )
    .bind(CURRENT_USER_ID, media.id, details.type, status)
    .first<{ id: number; status: LibraryStatus }>();

  if (inserted) {
    return { entryId: inserted.id, mediaId: media.id, created: true, status: inserted.status };
  }

  const existing = await db
    .prepare("SELECT id, status FROM library_entries WHERE user_id = ? AND media_id = ?")
    .bind(CURRENT_USER_ID, media.id)
    .first<{ id: number; status: LibraryStatus }>();
  if (!existing) throw new Error("Entrée de bibliothèque introuvable après insertion");
  return { entryId: existing.id, mediaId: media.id, created: false, status: existing.status };
}
