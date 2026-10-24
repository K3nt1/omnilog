// Lecture de la bibliothèque : grille filtrée et paginée, compteurs, pages par type.
// Uniquement des lectures : aucune écriture D1.
import { CURRENT_USER_ID } from "./library";
import { normalizeSearch } from "./search-text";
import {
  type LibraryCard,
  type LibraryQuery,
  type SortKey,
} from "./browse-shared";
import { LIBRARY_STATUSES, MEDIA_TYPES, type LibraryStatus, type MediaType } from "./types";

export * from "./browse-shared";

export const PAGE_SIZE = 60;
/** Nombre d'affiches par rangée sur les pages par type. */
export const ROW_SIZE = 14;

interface CardRow {
  entry_id: number;
  media_id: number;
  type: MediaType;
  title: string;
  original_title: string | null;
  release_date: string | null;
  poster_url: string | null;
  status: LibraryStatus;
  is_focus: number;
  is_favorite: number;
  rating: number | null;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  pause_seconds: number | null;
  pause_page: number | null;
  total_episodes: number | null;
  total_chapters: number | null;
  runtime_minutes: number | null;
  is_ongoing: number;
  sort_value?: string | number | null;
}

const CARD_COLUMNS = `
  l.id AS entry_id, m.id AS media_id, m.type, m.title, m.original_title, m.release_date,
  COALESCE(l.custom_poster_url, m.poster_url) AS poster_url,
  l.status, l.is_focus, l.is_favorite, l.rating,
  l.current_season, l.current_episode, l.current_chapter, l.pause_seconds, l.pause_page,
  m.total_episodes, m.total_chapters, m.runtime_minutes, m.is_ongoing`;

function toCard(row: CardRow): LibraryCard {
  return {
    entryId: row.entry_id,
    mediaId: row.media_id,
    type: row.type,
    title: row.title,
    originalTitle: row.original_title,
    releaseDate: row.release_date,
    posterUrl: row.poster_url,
    status: row.status,
    isFocus: row.is_focus === 1,
    isFavorite: row.is_favorite === 1,
    rating: row.rating,
    currentSeason: row.current_season,
    currentEpisode: row.current_episode,
    currentChapter: row.current_chapter,
    pauseSeconds: row.pause_seconds,
    pausePage: row.pause_page,
    totalEpisodes: row.total_episodes,
    totalChapters: row.total_chapters,
    runtimeMinutes: row.runtime_minutes,
    isOngoing: row.is_ongoing === 1,
    sortValue: row.sort_value ?? null,
  };
}

/**
 * Dernière activité : dernier visionnage du journal, sinon date de fin, de début, puis d'ajout.
 * (updated_at ne convient pas : chaque relance d'import le remet à jour.)
 */
const LAST_ACTIVITY = `COALESCE(
  (SELECT MAX(p.logged_at) FROM progress_log p WHERE p.entry_id = l.id),
  l.completed_at, l.started_at, l.created_at)`;

/** Nombre de visionnages complets (films pour l'instant ; relectures et parties viendront avec la v0.5). */
const COMPLETIONS = `(SELECT COUNT(*) FROM progress_log p WHERE p.entry_id = l.id AND p.kind = 'movie')`;

/** « Durée » selon le type : minutes (film, jeu), épisodes (série, animé), chapitres sinon tomes (manga). */
const DURATION = `CASE m.type
  WHEN 'movie' THEN m.runtime_minutes
  WHEN 'game' THEN m.runtime_minutes
  WHEN 'manga' THEN COALESCE(m.total_chapters, m.total_volumes)
  ELSE m.total_episodes END`;

const SORT_SQL: Record<SortKey, string> = {
  activite: LAST_ACTIVITY,
  ajout: "l.created_at",
  note: "l.rating",
  titre: "m.title COLLATE NOCASE",
  sortie: "m.release_date",
  fin: "l.completed_at",
  duree: DURATION,
  visionnages: COMPLETIONS,
};

interface Where {
  sql: string;
  params: unknown[];
}

/** Conditions SQL des filtres ; `skip` retire un filtre (pour les compteurs). */
function buildWhere(q: LibraryQuery, skip?: "type" | "status"): Where {
  const clauses = ["l.user_id = ?"];
  const params: unknown[] = [CURRENT_USER_ID];
  if (q.type && skip !== "type") {
    clauses.push("l.media_type = ?");
    params.push(q.type);
  }
  if (q.status && skip !== "status") {
    clauses.push("l.status = ?");
    params.push(q.status);
  }
  if (q.favorite) clauses.push("l.is_favorite = 1");
  // Trier par nombre de visionnages n'a d'intérêt que pour les œuvres revues : on n'affiche que celles-là.
  if (q.sort === "visionnages") clauses.push(`${COMPLETIONS} >= 2`);
  if (q.rating === "aucune") clauses.push("l.rating IS NULL");
  else if (q.rating) {
    clauses.push("l.rating >= ?");
    params.push(Number(q.rating) * 2);
  }
  const search = normalizeSearch(q.search);
  if (search) {
    // Sans accents ni majuscules, sur le titre français et le titre original (voir search-text.ts).
    clauses.push("m.search_text LIKE ? ESCAPE '\\'");
    params.push(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  return { sql: clauses.join(" AND "), params };
}

export interface LibraryPage {
  cards: LibraryCard[];
  total: number;
  page: number;
  pageCount: number;
  /** Nombre d'œuvres par statut, avec tous les autres filtres appliqués. */
  statusCounts: Record<LibraryStatus, number>;
  /** Nombre d'œuvres par type, avec tous les autres filtres appliqués. */
  typeCounts: Record<MediaType, number>;
}

const zeroCounts = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Une page de la grille : 3 requêtes (compteurs par statut, par type, puis les affiches). */
export async function getLibraryPage(db: D1Database, q: LibraryQuery): Promise<LibraryPage> {
  const byStatus = buildWhere(q, "status");
  const byType = buildWhere(q, "type");
  const [statusRows, typeRows] = await db.batch<{ key: string; n: number }>([
    db
      .prepare(
        `SELECT l.status AS key, COUNT(*) AS n FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE ${byStatus.sql} GROUP BY l.status`,
      )
      .bind(...byStatus.params),
    db
      .prepare(
        `SELECT l.media_type AS key, COUNT(*) AS n FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE ${byType.sql} GROUP BY l.media_type`,
      )
      .bind(...byType.params),
  ]);

  const statusCounts = zeroCounts(LIBRARY_STATUSES);
  for (const row of statusRows.results) statusCounts[row.key as LibraryStatus] = row.n;
  const typeCounts = zeroCounts(MEDIA_TYPES);
  for (const row of typeRows.results) typeCounts[row.key as MediaType] = row.n;

  const total = q.status
    ? statusCounts[q.status]
    : Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, q.page), pageCount);

  const where = buildWhere(q);
  const direction = q.direction === "asc" ? "ASC" : "DESC";
  const { results } = await db
    .prepare(
      `SELECT ${CARD_COLUMNS}, ${SORT_SQL[q.sort]} AS sort_value
       FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE ${where.sql}
       ORDER BY ${SORT_SQL[q.sort]} ${direction} NULLS LAST, l.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...where.params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<CardRow>();

  return { cards: results.map(toCard), total, page, pageCount, statusCounts, typeCounts };
}

// ---------------------------------------------------------------------
// Page d'un type (/films, /series…)
// ---------------------------------------------------------------------

export interface ActivityItem {
  /** « log » = une ligne du journal ; « done » = œuvre terminée sans journal (dates MAL, films vus sans date). */
  kind: "log" | "done";
  at: string;
  logKind: string | null;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  logRating: number | null;
  /** Épisode (titre Letterboxd « Sherlock: The Great Game ») ou point d'avancée d'une session de jeu. */
  note: string | null;
  /** Durée d'une session de jeu, en minutes. */
  minutes: number | null;
  card: LibraryCard;
}

export interface TypeOverview {
  statusCounts: Record<LibraryStatus, number>;
  favoriteCount: number;
  rows: Record<LibraryStatus, LibraryCard[]>;
  favorites: LibraryCard[];
  activity: ActivityItem[];
}

/** Ordre de chaque rangée : terminés par date de fin, watchlist par date d'ajout, le reste par activité. */
const ROW_ORDER = `CASE l.status
  WHEN 'completed' THEN COALESCE(l.completed_at, l.created_at)
  WHEN 'planned' THEN l.created_at
  ELSE ${LAST_ACTIVITY} END`;

/** Tout ce qu'affiche la page d'un type, en une seule série de 4 requêtes. */
export async function getTypeOverview(db: D1Database, type: MediaType): Promise<TypeOverview> {
  const [counts, rows, favorites, activity] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT l.status AS key, COUNT(*) AS n, SUM(l.is_favorite) AS fav FROM library_entries l
         WHERE l.user_id = ? AND l.media_type = ? GROUP BY l.status`,
      )
      .bind(CURRENT_USER_ID, type),
    db
      .prepare(
        `SELECT * FROM (
           SELECT ${CARD_COLUMNS},
                  ROW_NUMBER() OVER (PARTITION BY l.status ORDER BY ${ROW_ORDER} DESC, l.id DESC) AS rn
           FROM library_entries l JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ? AND l.media_type = ?
         ) WHERE rn <= ?`,
      )
      .bind(CURRENT_USER_ID, type, ROW_SIZE),
    db
      .prepare(
        `SELECT ${CARD_COLUMNS} FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND l.media_type = ? AND l.is_favorite = 1
         ORDER BY l.rating DESC NULLS LAST, ${LAST_ACTIVITY} DESC LIMIT ?`,
      )
      .bind(CURRENT_USER_ID, type, ROW_SIZE),
    db
      .prepare(
        `SELECT * FROM (
           SELECT 'log' AS item_kind, p.logged_at AS at, p.kind AS log_kind, p.season, p.episode, p.chapter,
                  p.rating AS log_rating, p.note AS log_note, p.duration_minutes AS log_minutes, ${CARD_COLUMNS}
           FROM progress_log p
           JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ?1 AND l.media_type = ?2 AND p.kind <> 'pause'
           UNION ALL
           SELECT 'done', l.completed_at, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${CARD_COLUMNS}
           FROM library_entries l JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ?1 AND l.media_type = ?2 AND l.completed_at IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id)
         ) ORDER BY at DESC LIMIT 12`,
      )
      .bind(CURRENT_USER_ID, type),
  ]);

  const statusCounts = zeroCounts(LIBRARY_STATUSES);
  let favoriteCount = 0;
  for (const row of counts.results as { key: LibraryStatus; n: number; fav: number | null }[]) {
    statusCounts[row.key] = row.n;
    favoriteCount += row.fav ?? 0;
  }

  const byStatus = Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, [] as LibraryCard[]])) as Record<
    LibraryStatus,
    LibraryCard[]
  >;
  for (const row of rows.results as unknown as CardRow[]) byStatus[row.status].push(toCard(row));

  type ActivityRow = CardRow & {
    item_kind: "log" | "done";
    at: string;
    log_kind: string | null;
    season: number | null;
    episode: number | null;
    chapter: number | null;
    log_rating: number | null;
    log_note: string | null;
    log_minutes: number | null;
  };

  return {
    statusCounts,
    favoriteCount,
    rows: byStatus,
    favorites: (favorites.results as unknown as CardRow[]).map(toCard),
    activity: (activity.results as unknown as ActivityRow[]).map((row) => ({
      kind: row.item_kind,
      at: row.at,
      logKind: row.log_kind,
      season: row.season,
      episode: row.episode,
      chapter: row.chapter,
      logRating: row.log_rating,
      note: row.log_note,
      minutes: row.log_minutes,
      card: toCard(row),
    })),
  };
}
