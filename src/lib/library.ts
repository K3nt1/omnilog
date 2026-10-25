// Accès à la base D1 pour la bibliothèque.
import type { LibraryStatus, MediaDetails, SearchResult } from "./types";
import { mediaSearchText } from "./search-text";
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
                          is_ongoing, extra_json, fetched_at, search_text)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
       ON CONFLICT (type, source, external_id) DO UPDATE SET
         title = excluded.title, original_title = excluded.original_title, overview = excluded.overview,
         poster_url = excluded.poster_url, backdrop_url = excluded.backdrop_url,
         release_date = excluded.release_date, runtime_minutes = excluded.runtime_minutes,
         total_episodes = excluded.total_episodes, total_chapters = excluded.total_chapters,
         total_volumes = excluded.total_volumes, is_ongoing = excluded.is_ongoing,
         extra_json = excluded.extra_json, fetched_at = excluded.fetched_at,
         search_text = excluded.search_text
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
      mediaSearchText(details.title, details.originalTitle),
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

export type ImportSource = "letterboxd" | "mal" | "serializd" | "backloggd";

/** D1 accepte au plus 100 paramètres par requête : on découpe les listes. */
const PARAM_CHUNK = 90;
const chunks = <T,>(items: T[], size = PARAM_CHUNK) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Œuvre déjà reliée à une entrée d'export, avec son type (film, série…). */
export type ImportLink = { mediaId: number; type: MediaType };

/** Entrées d'export déjà reconnues : clé externe -> identifiant de l'œuvre. */
export async function findImportLinks(
  db: D1Database,
  source: ImportSource,
  keys: string[],
): Promise<Map<string, ImportLink>> {
  const found = new Map<string, ImportLink>();
  for (const part of chunks([...new Set(keys)])) {
    const { results } = await db
      .prepare(
        `SELECT l.external_key, l.media_id, m.type FROM import_links l
         JOIN media m ON m.id = l.media_id
         WHERE l.source = ? AND l.external_key IN (${part.map(() => "?").join(", ")})`,
      )
      .bind(source, ...part)
      .all<{ external_key: string; media_id: number; type: MediaType }>();
    for (const row of results) found.set(row.external_key, { mediaId: row.media_id, type: row.type });
  }
  return found;
}

/** Une autre entrée d'export pointe-t-elle déjà vers cette œuvre ? Renvoie sa clé, sinon null. */
export async function findOtherImportLink(
  db: D1Database,
  source: ImportSource,
  mediaId: number,
  exceptKey: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT external_key FROM import_links WHERE source = ? AND media_id = ? AND external_key <> ? LIMIT 1")
    .bind(source, mediaId, exceptKey)
    .first<{ external_key: string }>();
  return row?.external_key ?? null;
}

export async function saveImportLink(db: D1Database, source: ImportSource, key: string, mediaId: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO import_links (source, external_key, media_id) VALUES (?, ?, ?)
       ON CONFLICT (source, external_key) DO UPDATE SET media_id = excluded.media_id`,
    )
    .bind(source, key, mediaId)
    .run();
}

/** Enregistre un lien vers un site officiel, sauf si l'œuvre en a déjà un pour ce site. */
export async function setExternalLinkIfAbsent(
  db: D1Database,
  mediaId: number,
  site: "letterboxd" | "serializd" | "backloggd" | "myanimelist",
  url: string,
): Promise<void> {
  const path = `$.${site}`;
  await db
    .prepare(
      `UPDATE media SET external_links_json = json_set(COALESCE(external_links_json, '{}'), ?, ?)
       WHERE id = ? AND json_extract(COALESCE(external_links_json, '{}'), ?) IS NULL`,
    )
    .bind(path, url, mediaId, path)
    .run();
}

/**
 * Annule une correspondance d'import :
 *  - si aucune autre entrée d'export ne pointe vers cette œuvre, l'entrée de bibliothèque
 *    est supprimée (visionnages et rappels partent avec, en cascade) ;
 *  - sinon (plusieurs épisodes rattachés à la même série), seuls les visionnages de
 *    cette entrée sont retirés.
 */
export async function undoImportLink(
  db: D1Database,
  source: ImportSource,
  key: string,
  refs: string[],
): Promise<boolean> {
  const link = await db
    .prepare("SELECT media_id FROM import_links WHERE source = ? AND external_key = ?")
    .bind(source, key)
    .first<{ media_id: number }>();
  if (!link) return false;

  await db.prepare("DELETE FROM import_links WHERE source = ? AND external_key = ?").bind(source, key).run();
  const others = await findOtherImportLink(db, source, link.media_id, key);

  if (others === null) {
    await db.batch([
      db.prepare("DELETE FROM library_entries WHERE user_id = ? AND media_id = ?").bind(CURRENT_USER_ID, link.media_id),
      db
        .prepare(
          "UPDATE media SET external_links_json = json_remove(external_links_json, ?) WHERE id = ? AND external_links_json IS NOT NULL",
        )
        .bind(`$.${source}`, link.media_id),
    ]);
  } else {
    for (const part of chunks(refs)) {
      await db
        .prepare(
          `DELETE FROM progress_log
           WHERE external_ref IN (${part.map(() => "?").join(", ")})
             AND entry_id IN (SELECT id FROM library_entries WHERE user_id = ? AND media_id = ?)`,
        )
        .bind(...part, CURRENT_USER_ID, link.media_id)
        .run();
    }
  }
  return true;
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
  /** Date d'ajout sur le site d'origine (AAAA-MM-JJ) ; sinon la date de l'import. */
  addedAt: string | null;
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
                                    current_episode, current_chapter, started_at, completed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
               COALESCE(?12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
       ON CONFLICT (user_id, media_id) DO UPDATE SET
         -- Date d'ajout : on garde la plus ancienne (plusieurs entrées Letterboxd peuvent viser la même série).
         created_at = MIN(created_at, excluded.created_at),
         -- Jamais de retour en arrière : une œuvre terminée ne redevient pas « à voir ».
         status = CASE WHEN status = 'completed' AND excluded.status = 'planned' THEN status ELSE excluded.status END,
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
      entry.addedAt ? `${entry.addedAt}T00:00:00.000Z` : null,
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
  /** Épisode de série (titre Letterboxd « Sherlock: The Great Game »), ou point d'avancée d'un jeu. */
  note: string | null;
}

/** Insère l'historique des visionnages ; les entrées déjà importées (même external_ref) sont ignorées. */
export async function insertImportedLogs(db: D1Database, entryId: number, logs: ImportedLog[]): Promise<void> {
  if (logs.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO progress_log (entry_id, kind, rating, review, tags_json, external_ref, logged_at, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        log.note,
      ),
    ),
  );
}

export interface BackfillCounts {
  dates: number;
  episodes: number;
  removed: number;
}

export interface LetterboxdBackfillItem {
  key: string; // clé de l'entrée Letterboxd (letterboxdLinkKey)
  addedDate: string | null; // AAAA-MM-JJ
  name: string; // titre Letterboxd (« Sherlock: The Great Game »)
  refs: string[]; // visionnages du journal (external_ref)
  watched: boolean; // marqué vu sur Letterboxd (sinon : watchlist)
}

/**
 * Complète un import Letterboxd fait avant la v0.4.0, sans tout réimporter :
 * - date d'ajout : la date Letterboxd au lieu de la date de l'import (on ne fait que la reculer) ;
 * - séries : le nom de l'épisode sur chaque visionnage, et un visionnage pour les épisodes marqués vus sans date.
 *   (Les épisodes seulement en watchlist n'en ont pas : on retire ceux créés à tort par la première version.)
 * Renvoie le nombre de dates corrigées, d'épisodes complétés et de visionnages retirés.
 */
export async function backfillLetterboxd(
  db: D1Database,
  items: LetterboxdBackfillItem[],
): Promise<BackfillCounts> {
  const count: BackfillCounts = { dates: 0, episodes: 0, removed: 0 };
  if (items.length === 0) return count;
  const links = await findImportLinks(db, "letterboxd", items.map((i) => i.key));

  const statements: D1PreparedStatement[] = [];
  const kinds: (keyof BackfillCounts)[] = [];
  const setDate = db.prepare(
    `UPDATE library_entries SET created_at = ?1 WHERE user_id = ?2 AND media_id = ?3 AND created_at > ?1`,
  );
  for (const item of items) {
    const link = links.get(item.key);
    if (!link) continue;
    if (item.addedDate) {
      statements.push(setDate.bind(`${item.addedDate}T00:00:00.000Z`, CURRENT_USER_ID, link.mediaId));
      kinds.push("dates");
    }
    if (link.type !== "tv") continue;
    if (item.refs.length > 0) {
      statements.push(
        db
          .prepare(
            `UPDATE progress_log SET note = ? WHERE note IS NULL AND kind = 'episode'
             AND external_ref IN (${item.refs.map(() => "?").join(", ")})`,
          )
          .bind(item.name, ...item.refs),
      );
    } else if (!item.watched) {
      // Épisode seulement en watchlist : aucun visionnage.
      statements.push(
        db.prepare("DELETE FROM progress_log WHERE external_ref = ?").bind(`${item.key}#vu`),
      );
      kinds.push("removed");
      continue;
    } else {
      // Épisode marqué vu sur Letterboxd sans date dans le journal : un visionnage à la date d'ajout.
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO progress_log (entry_id, kind, external_ref, logged_at, note)
             SELECT id, 'episode', ?, ?, ? FROM library_entries WHERE user_id = ? AND media_id = ?`,
          )
          .bind(
            `${item.key}#vu`,
            item.addedDate ? `${item.addedDate}T00:00:00.000Z` : new Date().toISOString(),
            item.name,
            CURRENT_USER_ID,
            link.mediaId,
          ),
      );
    }
    kinds.push("episodes");
  }
  if (statements.length === 0) return count;

  const results = await db.batch(statements);
  results.forEach((r, i) => {
    count[kinds[i]] += r.meta.changes ?? 0;
  });
  return count;
}
