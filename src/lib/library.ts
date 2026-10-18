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
 * Enregistre (ou rafraîchit) l'œuvre dans le catalogue, avec ses saisons pour une série.
 * Renvoie l'identifiant interne de l'œuvre.
 */
export async function upsertMedia(db: D1Database, details: MediaDetails): Promise<number> {
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
  return media.id;
}

/** Ajoute l'œuvre à ta bibliothèque si elle n'y est pas déjà (bouton « + À voir »). */
export async function addToLibrary(
  db: D1Database,
  details: MediaDetails,
  status: LibraryStatus,
): Promise<AddResult> {
  const media = { id: await upsertMedia(db, details) };

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

// ---------------------------------------------------------------------
// Import (Letterboxd, MyAnimeList)
// ---------------------------------------------------------------------

/** Œuvres déjà reconnues lors d'un import précédent, retrouvées par leur lien Letterboxd. */
export async function findMediaIdsByLetterboxdUri(db: D1Database, uris: string[]): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const unique = [...new Set(uris)];
  if (unique.length === 0) return found;
  // L'expression doit être identique à celle de l'index idx_media_letterboxd (migration 0004).
  const { results } = await db
    .prepare(
      `SELECT id, json_extract(external_links_json, '$.letterboxd') AS uri
       FROM media
       WHERE json_extract(external_links_json, '$.letterboxd') IN (${unique.map(() => "?").join(", ")})`,
    )
    .bind(...unique)
    .all<{ id: number; uri: string }>();
  for (const row of results) found.set(row.uri, row.id);
  return found;
}

/** Ajoute ou remplace un lien vers un site officiel dans media.external_links_json. */
export async function setExternalLink(
  db: D1Database,
  mediaId: number,
  site: "letterboxd" | "serializd" | "backloggd" | "myanimelist",
  url: string,
): Promise<void> {
  await db
    .prepare("UPDATE media SET external_links_json = json_set(COALESCE(external_links_json, '{}'), ?, ?) WHERE id = ?")
    .bind(`$.${site}`, url, mediaId)
    .run();
}

export interface ImportedEntry {
  status: LibraryStatus;
  rating: number | null; // 1 à 10
  review: string | null;
  isFavorite: boolean;
  currentEpisode: number | null;
  currentChapter: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Crée ou met à jour l'entrée de bibliothèque avec les données importées.
 * Relancer un import met donc les entrées à jour au lieu de créer des doublons.
 */
export async function upsertImportedEntry(
  db: D1Database,
  mediaId: number,
  mediaType: MediaType,
  entry: ImportedEntry,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO library_entries (user_id, media_id, media_type, status, rating, review, is_favorite,
                                    current_episode, current_chapter, started_at, completed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (user_id, media_id) DO UPDATE SET
         status = excluded.status,
         is_focus = CASE WHEN excluded.status = 'in_progress' THEN is_focus ELSE 0 END,
         rating = COALESCE(excluded.rating, rating),
         review = COALESCE(excluded.review, review),
         is_favorite = MAX(is_favorite, excluded.is_favorite),
         current_episode = excluded.current_episode,
         current_chapter = excluded.current_chapter,
         started_at = COALESCE(excluded.started_at, started_at),
         completed_at = COALESCE(excluded.completed_at, completed_at)
       RETURNING id`,
    )
    .bind(
      CURRENT_USER_ID,
      mediaId,
      mediaType,
      entry.status,
      entry.rating,
      entry.review,
      entry.isFavorite ? 1 : 0,
      entry.currentEpisode,
      entry.currentChapter,
      entry.startedAt,
      entry.completedAt,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("Impossible d'enregistrer l'entrée de bibliothèque");
  return row.id;
}

export interface ImportedLog {
  kind: "movie" | "episode" | "chapter" | "session";
  rating: number | null;
  review: string | null;
  tags: string[];
  externalRef: string;
  loggedAt: string; // ISO 8601
}

/** Insère l'historique des visionnages ; les entrées déjà importées (même external_ref) sont ignorées. */
export async function insertImportedLogs(db: D1Database, entryId: number, logs: ImportedLog[]): Promise<void> {
  if (logs.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO progress_log (entry_id, kind, rating, review, tags_json, external_ref, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(
    logs.map((log) =>
      insert.bind(
        entryId,
        log.kind,
        log.rating,
        log.review,
        log.tags.length > 0 ? JSON.stringify(log.tags) : null,
        log.externalRef,
        log.loggedAt,
      ),
    ),
  );
}
