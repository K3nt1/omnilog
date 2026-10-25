// Fiche média côté base : l'œuvre (si elle est en base), ton suivi, ton journal ; et leurs modifications.
import { CURRENT_USER_ID } from "./library";
import { SOURCE_FOR_TYPE, type LibraryStatus, type MediaType } from "./types";

export interface StoredMedia {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  totalEpisodes: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  isOngoing: boolean;
  genres: string[];
  publisherFr: string | null;
  /** Liens enregistrés à l'import (Letterboxd…), prioritaires sur les liens construits. */
  externalLinks: Record<string, string>;
}

export interface LibraryEntry {
  id: number;
  status: LibraryStatus;
  isFocus: boolean;
  isFavorite: boolean;
  rating: number | null;
  review: string | null;
  startedAt: string | null;
  completedAt: string | null;
  addedAt: string;
  customPosterUrl: string | null;
  customBackdropUrl: string | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  currentChapter: number | null;
  pauseSeconds: number | null;
  pausePage: number | null;
  gameCheckpoint: string | null;
  sessionsCount: number;
  playtimeMinutes: number | null;
  /** Tirée au sort et pas encore commencée. */
  drawnAt: string | null;
  /** Une progression faite dans Omnilog peut être annulée. */
  canUndo: boolean;
}

export interface JournalLine {
  id: number;
  kind: string;
  at: string;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  minutes: number | null;
  rating: number | null;
  review: string | null;
  tags: string[];
  note: string | null;
}

export interface StoredFiche {
  media: StoredMedia | null;
  entry: LibraryEntry | null;
  journal: JournalLine[];
  watchRegion: string;
}

/** Ligne renvoyée par la requête œuvre + suivi (colonnes de media, puis celles de library_entries). */
interface MediaRow {
  id: number;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  release_date: string | null;
  runtime_minutes: number | null;
  total_episodes: number | null;
  total_chapters: number | null;
  total_volumes: number | null;
  is_ongoing: number;
  extra_json: string | null;
  publisher_fr: string | null;
  external_links_json: string | null;
  entry_id: number | null;
  status: LibraryStatus;
  is_focus: number;
  is_favorite: number;
  rating: number | null;
  review: string | null;
  started_at: string | null;
  completed_at: string | null;
  added_at: string;
  custom_poster_url: string | null;
  custom_backdrop_url: string | null;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  pause_seconds: number | null;
  pause_page: number | null;
  game_checkpoint: string | null;
  sessions_count: number;
  playtime_minutes: number | null;
  drawn_at: string | null;
  can_undo: number;
}

interface JournalRow {
  id: number;
  kind: string;
  logged_at: string;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  duration_minutes: number | null;
  rating: number | null;
  review: string | null;
  tags_json: string | null;
  note: string | null;
}

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/** Tout ce que la base sait d'une œuvre, en un seul aller-retour (3 requêtes). */
export async function getStoredFiche(db: D1Database, type: MediaType, externalId: string): Promise<StoredFiche> {
  const source = SOURCE_FOR_TYPE[type];
  const [mediaRows, journalRows, userRows] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT m.*, l.id AS entry_id, l.status, EXISTS (SELECT 1 FROM focus f WHERE f.entry_id = l.id) AS is_focus, l.is_favorite, l.rating, l.review,
                l.started_at, l.completed_at, l.created_at AS added_at, l.custom_poster_url, l.custom_backdrop_url,
                l.current_season, l.current_episode, l.current_chapter, l.pause_seconds, l.pause_page,
                l.game_checkpoint, l.sessions_count, l.playtime_minutes, l.drawn_at,
                EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id AND p.undo_json IS NOT NULL) AS can_undo
         FROM media m LEFT JOIN library_entries l ON l.media_id = m.id AND l.user_id = ?
         WHERE m.type = ? AND m.source = ? AND m.external_id = ?`,
      )
      .bind(CURRENT_USER_ID, type, source, externalId),
    db
      .prepare(
        `SELECT p.id, p.kind, p.logged_at, p.season, p.episode, p.chapter, p.duration_minutes, p.rating, p.review,
                p.tags_json, p.note
         FROM progress_log p
         JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND m.type = ? AND m.source = ? AND m.external_id = ? AND p.kind <> 'pause'
         ORDER BY p.logged_at DESC, p.id DESC LIMIT 200`,
      )
      .bind(CURRENT_USER_ID, type, source, externalId),
    db.prepare("SELECT watch_region FROM users WHERE id = ?").bind(CURRENT_USER_ID),
  ]);

  const row = mediaRows.results[0] as unknown as MediaRow | undefined;
  const media: StoredMedia | null = row
    ? {
        id: row.id,
        title: row.title,
        originalTitle: row.original_title,
        overview: row.overview,
        posterUrl: row.poster_url,
        backdropUrl: row.backdrop_url,
        releaseDate: row.release_date,
        runtimeMinutes: row.runtime_minutes,
        totalEpisodes: row.total_episodes,
        totalChapters: row.total_chapters,
        totalVolumes: row.total_volumes,
        isOngoing: row.is_ongoing === 1,
        genres: parseJson<{ genres?: string[] }>(row.extra_json, {}).genres ?? [],
        publisherFr: row.publisher_fr ?? null,
        externalLinks: parseJson<Record<string, string>>(row.external_links_json, {}),
      }
    : null;
  const entry: LibraryEntry | null =
    row && row.entry_id !== null
      ? {
          id: row.entry_id,
          status: row.status,
          isFocus: row.is_focus === 1,
          isFavorite: row.is_favorite === 1,
          rating: row.rating,
          review: row.review,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          addedAt: row.added_at,
          customPosterUrl: row.custom_poster_url,
          customBackdropUrl: row.custom_backdrop_url,
          currentSeason: row.current_season,
          currentEpisode: row.current_episode,
          currentChapter: row.current_chapter,
          pauseSeconds: row.pause_seconds,
          pausePage: row.pause_page,
          gameCheckpoint: row.game_checkpoint,
          sessionsCount: row.sessions_count,
          playtimeMinutes: row.playtime_minutes,
          drawnAt: row.drawn_at,
          canUndo: row.can_undo === 1,
        }
      : null;

  const journal = (journalRows.results as unknown as JournalRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    at: r.logged_at,
    season: r.season,
    episode: r.episode,
    chapter: r.chapter,
    minutes: r.duration_minutes,
    rating: r.rating,
    review: r.review,
    tags: parseJson<string[]>(r.tags_json, []),
    note: r.note,
  }));

  const region = (userRows.results[0] as { watch_region?: string } | undefined)?.watch_region ?? "FR";
  return { media, entry, journal, watchRegion: region };
}

/** Statut dans ta bibliothèque des œuvres liées affichées sur la fiche (« Vu », « À voir »…). */
export async function getLibraryStatuses(
  db: D1Database,
  works: { type: MediaType; externalId: string }[],
): Promise<Map<string, LibraryStatus>> {
  const statuses = new Map<string, LibraryStatus>();
  const ids = [...new Set(works.map((w) => w.externalId))].slice(0, 90);
  if (ids.length === 0) return statuses;
  const { results } = await db
    .prepare(
      `SELECT m.type, m.external_id, l.status FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.external_id IN (${ids.map(() => "?").join(", ")})`,
    )
    .bind(CURRENT_USER_ID, ...ids)
    .all<{ type: MediaType; external_id: string; status: LibraryStatus }>();
  for (const r of results) statuses.set(`${r.type}:${r.external_id}`, r.status);
  return statuses;
}

/** Modifications possibles depuis la fiche (« Mon suivi »). Un champ absent n'est pas modifié. */
export interface EntryPatch {
  status?: LibraryStatus;
  isFavorite?: boolean;
  rating?: number | null; // 1 à 10
  review?: string | null;
  startedAt?: string | null; // AAAA-MM-JJ
  completedAt?: string | null;
}

/** Applique les modifications ; renvoie false si l'entrée n'existe pas. */
export async function updateEntry(db: D1Database, entryId: number, patch: EntryPatch): Promise<boolean> {
  // Chaque morceau du SET avec ses paramètres, dans l'ordre des « ? ».
  const parts: [sql: string, params: unknown[]][] = [];
  if (patch.status !== undefined) {
    parts.push(["status = ?", [patch.status]]);
    // Dates remplies automatiquement si elles sont vides (modifiables ensuite).
    if (patch.status === "completed" && patch.completedAt === undefined) {
      parts.push(["completed_at = COALESCE(completed_at, date('now'))", []]);
    }
    if (patch.status === "in_progress" && patch.startedAt === undefined) {
      parts.push(["started_at = COALESCE(started_at, date('now'))", []]);
    }
  }
  if (patch.isFavorite !== undefined) parts.push(["is_favorite = ?", [patch.isFavorite ? 1 : 0]]);
  if (patch.rating !== undefined) parts.push(["rating = ?", [patch.rating]]);
  if (patch.review !== undefined) parts.push(["review = ?", [patch.review]]);
  if (patch.startedAt !== undefined) parts.push(["started_at = ?", [patch.startedAt]]);
  if (patch.completedAt !== undefined) parts.push(["completed_at = ?", [patch.completedAt]]);
  if (parts.length === 0) return true;

  const update = db
    .prepare(`UPDATE library_entries SET ${parts.map(([sql]) => sql).join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...parts.flatMap(([, params]) => params), entryId, CURRENT_USER_ID);
  // Une œuvre terminée ou abandonnée n'est plus « en ce moment ».
  const leavesFocus = patch.status === "completed" || patch.status === "dropped";
  const [result] = await db.batch(
    leavesFocus ? [update, db.prepare("DELETE FROM focus WHERE entry_id = ?").bind(entryId)] : [update],
  );
  return (result.meta.changes ?? 0) > 0;
}

/** Éditeur français d'un manga, saisi à la main (null pour l'effacer). */
export async function setPublisherFr(db: D1Database, mediaId: number, publisher: string | null): Promise<boolean> {
  const result = await db
    .prepare("UPDATE media SET publisher_fr = ? WHERE id = ? AND type = 'manga'")
    .bind(publisher, mediaId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export interface EpisodeLog {
  id: number;
  season: number | null;
  episode: number | null;
  note: string | null;
  at: string;
  rating: number | null;
  review: string | null;
}

/** Visionnages d'épisodes d'une série (pour cocher les épisodes vus dans la liste d'une saison). */
export async function getEpisodeLogs(
  db: D1Database,
  externalId: string,
): Promise<{ titles: (string | null)[]; logs: EpisodeLog[] }> {
  const [media, logs] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT title, original_title FROM media WHERE type = 'tv' AND source = 'tmdb' AND external_id = ?").bind(externalId),
    db
      .prepare(
        `SELECT p.id, p.season, p.episode, p.note, p.logged_at AS at, p.rating, p.review
         FROM progress_log p JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND m.type = 'tv' AND m.source = 'tmdb' AND m.external_id = ? AND p.kind = 'episode'
         ORDER BY p.logged_at DESC`,
      )
      .bind(CURRENT_USER_ID, externalId),
  ]);
  const m = media.results[0] as { title: string; original_title: string | null } | undefined;
  return { titles: m ? [m.title, m.original_title] : [], logs: logs.results as unknown as EpisodeLog[] };
}
