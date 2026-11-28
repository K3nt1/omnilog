// Fiche média côté base : l'œuvre (si elle est en base), ton suivi, ton journal ; et leurs modifications.
import { allIssuesRead, nextUnreadIssue } from "./comic-progress";
import { CURRENT_USER_ID, statusesByExternalId } from "./library";
import { parseRelease, type ReleaseInfo } from "./release-shared";
import { cachedVersioned } from "./data-version";
import { seasonReviewsStatement, toSeasonReviewLine, type SeasonReviewLine, type SeasonReviewRow } from "./season-reviews";
import { GAME_ONLY_STATUSES, SOURCE_FOR_TYPE, sourceOf, storedStatus, type LibraryStatus, type MediaType } from "./types";

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
  /** Jeu ajouté à la main : plateformes saisies. */
  platforms: string[];
  /** « year » : seule l'année de sortie est connue (œuvre ajoutée à la main). */
  releasePrecision: string | null;
  publisherFr: string | null;
  /** Liens enregistrés à l'import (Letterboxd…), prioritaires sur les liens construits. */
  externalLinks: Record<string, string>;
  /** Prochain épisode / dernier chapitre enregistré (voir release.ts). */
  release: ReleaseInfo | null;
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
  /** Cadrage de l'image de fond (position CSS « 50% 30% »). */
  backdropPosition: string | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  currentChapter: number | null;
  /** Manga : tome en cours. */
  currentVolume: number | null;
  pauseSeconds: number | null;
  pausePage: number | null;
  gameCheckpoint: string | null;
  sessionsCount: number;
  playtimeMinutes: number | null;
  /** Tirée au sort et pas encore commencée. */
  drawnAt: string | null;
  /** Une progression faite dans Omnilog peut être annulée. */
  canUndo: boolean;
  /** Comics : série suivie (position, prochain numéro) ou numéros isolés. */
  followsSeries: boolean;
  /** Comics : nombre de numéros différents lus. */
  issuesRead: number;
  /** Jeux : 🏆 fini à 100 %. */
  mastered: boolean;
}

export interface JournalLine {
  id: number;
  kind: string;
  at: string;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  volume: number | null;
  minutes: number | null;
  rating: number | null;
  review: string | null;
  tags: string[];
  note: string | null;
  /** Ajouté sans date de visionnage (at = jour de l'ajout). */
  undated: boolean;
}

export interface StoredFiche {
  media: StoredMedia | null;
  entry: LibraryEntry | null;
  journal: JournalLine[];
  /** Séries : notes et critiques des saisons, la plus récente d'abord. */
  seasonReviews: SeasonReviewLine[];
  watchRegion: string;
  /** Tous tes tags du journal, du plus utilisé au moins utilisé (suggestions à la saisie). */
  knownTags: string[];
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
  release_json: string | null;
  entry_id: number | null;
  status: LibraryStatus;
  mastered: number;
  is_focus: number;
  is_favorite: number;
  rating: number | null;
  review: string | null;
  started_at: string | null;
  completed_at: string | null;
  added_at: string;
  custom_poster_url: string | null;
  custom_backdrop_url: string | null;
  backdrop_position: string | null;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  current_volume: number | null;
  pause_seconds: number | null;
  pause_page: number | null;
  game_checkpoint: string | null;
  sessions_count: number;
  playtime_minutes: number | null;
  drawn_at: string | null;
  can_undo: number;
  follows_series: number | null;
  issues_read: number | null;
}

interface JournalRow {
  id: number;
  kind: string;
  logged_at: string;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  volume: number | null;
  duration_minutes: number | null;
  rating: number | null;
  review: string | null;
  tags_json: string | null;
  note: string | null;
  undated: number;
}

/** Liste de textes d'un JSON enregistré (tout autre contenu est ignoré). */
const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/** Tags du journal, du plus utilisé au moins utilisé, gardés jusqu'au prochain changement de tag. */
export function getKnownTags(db: D1Database, tagsVersion: number): Promise<string[]> {
  return cachedVersioned(db, "tags", [tagsVersion], async () => {
    const { results } = await db
      .prepare(
        `SELECT t.value AS tag, COUNT(*) AS n
         FROM progress_log p INDEXED BY idx_progress_tags JOIN library_entries l ON l.id = p.entry_id, json_each(p.tags_json) t
         WHERE p.tags_json IS NOT NULL AND +l.user_id = ?
         GROUP BY t.value ORDER BY n DESC, t.value LIMIT 500`,
      )
      .bind(CURRENT_USER_ID)
      .all<{ tag: string }>();
    return results.map((r) => String(r.tag));
  });
}

/** Tout ce que la base sait d'une œuvre, en un seul aller-retour (3 requêtes). */
export async function getStoredFiche(db: D1Database, type: MediaType, externalId: string): Promise<StoredFiche> {
  const source = sourceOf(type, externalId);
  const [mediaRows, journalRows, userRows, seasonRows] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT m.*, l.id AS entry_id, l.list_status AS status, l.mastered, EXISTS (SELECT 1 FROM focus f WHERE f.entry_id = l.id) AS is_focus, l.is_favorite, l.rating, l.review,
                l.started_at, l.completed_at, l.created_at AS added_at, l.custom_poster_url, l.custom_backdrop_url,
                l.backdrop_position, l.current_season, l.current_episode, l.current_chapter, l.current_volume, l.pause_seconds, l.pause_page,
                l.game_checkpoint, l.sessions_count, l.playtime_minutes, l.drawn_at, l.follows_series,
                EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id AND p.undo_json IS NOT NULL) AS can_undo,
                CASE WHEN m.type = 'comic' THEN (SELECT COUNT(DISTINCT p.chapter) FROM progress_log p
                  WHERE p.entry_id = l.id AND p.kind = 'chapter' AND p.chapter IS NOT NULL) END AS issues_read
         FROM media m LEFT JOIN library_entries l ON l.media_id = m.id AND l.user_id = ?
         WHERE m.type = ? AND m.source = ? AND m.external_id = ?`,
      )
      .bind(CURRENT_USER_ID, type, source, externalId),
    db
      .prepare(
        `SELECT p.id, p.kind, p.logged_at, p.season, p.episode, p.chapter, p.volume, p.duration_minutes, p.rating, p.review,
                p.tags_json, p.note, p.undated
         FROM progress_log p
         JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND m.type = ? AND m.source = ? AND m.external_id = ? AND p.kind <> 'pause'
         ORDER BY p.logged_at DESC, p.id DESC LIMIT 200`,
      )
      .bind(CURRENT_USER_ID, type, source, externalId),
    db.prepare("SELECT watch_region, tags_version FROM users WHERE id = ?").bind(CURRENT_USER_ID),
    // Séries seulement : les autres types n'ont pas de critiques de saison (pas de lecture inutile).
    ...(type === "tv" ? [seasonReviewsStatement(db, source, externalId)] : []),
  ]);
  // Tags déjà utilisés (suggestions) : relus seulement quand un tag change (migration 0019).
  const tagsVersion = Number((userRows.results[0] as { tags_version?: number } | undefined)?.tags_version ?? 0);
  const knownTags = await getKnownTags(db, tagsVersion);

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
        platforms: stringList(parseJson<{ platforms?: unknown }>(row.extra_json, {}).platforms),
        releasePrecision: parseJson<{ releasePrecision?: string | null }>(row.extra_json, {}).releasePrecision ?? null,
        publisherFr: row.publisher_fr ?? null,
        externalLinks: parseJson<Record<string, string>>(row.external_links_json, {}),
        release: parseRelease(row.release_json),
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
          backdropPosition: row.backdrop_position,
          currentSeason: row.current_season,
          currentEpisode: row.current_episode,
          currentChapter: row.current_chapter,
          currentVolume: row.current_volume,
          pauseSeconds: row.pause_seconds,
          pausePage: row.pause_page,
          gameCheckpoint: row.game_checkpoint,
          sessionsCount: row.sessions_count,
          playtimeMinutes: row.playtime_minutes,
          drawnAt: row.drawn_at,
          canUndo: row.can_undo === 1,
          followsSeries: row.follows_series !== 0,
          issuesRead: row.issues_read ?? 0,
          mastered: row.mastered === 1,
        }
      : null;

  const journal = (journalRows.results as unknown as JournalRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    at: r.logged_at,
    season: r.season,
    episode: r.episode,
    chapter: r.chapter,
    volume: r.volume,
    minutes: r.duration_minutes,
    rating: r.rating,
    review: r.review,
    tags: parseJson<string[]>(r.tags_json, []),
    note: r.note,
    undated: r.undated === 1,
  }));

  const region = (userRows.results[0] as { watch_region?: string } | undefined)?.watch_region ?? "FR";
  const seasonReviews = ((seasonRows?.results ?? []) as unknown as SeasonReviewRow[]).map(toSeasonReviewLine);
  return { media, entry, journal, seasonReviews, watchRegion: region, knownTags };
}

/** Statut dans ta bibliothèque des œuvres liées affichées sur la fiche (« Vu », « À voir »…). */
export async function getLibraryStatuses(
  db: D1Database,
  works: { type: MediaType; externalId: string }[],
): Promise<Map<string, LibraryStatus>> {
  const statuses = new Map<string, LibraryStatus>();
  const rows = await statusesByExternalId(
    db,
    works.slice(0, 90).map((w) => ({ type: w.type, source: SOURCE_FOR_TYPE[w.type], externalId: w.externalId })),
  );
  for (const r of rows) statuses.set(`${r.type}:${r.external_id}`, r.status);
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
  /** Affiche / image de fond personnalisées (null = celles de la source) et cadrage du fond. */
  customPosterUrl?: string | null;
  customBackdropUrl?: string | null;
  backdropPosition?: string | null;
  /** Comics : suivre la série (true) ou numéros isolés (false) ; le statut et la position sont recalculés. */
  followsSeries?: boolean;
  /** Jeux : 🏆 fini à 100 % (indépendant du statut). */
  mastered?: boolean;
}

/** Morceaux du SET pour un changement de statut (dates remplies ou effacées selon le statut). */
function statusParts(patch: EntryPatch): [sql: string, params: unknown[]][] {
  if (patch.status === undefined) return [];
  // « Joué » et « Envies » : un jeu terminé ou prévu, précisé par substatus (écrits ensemble, voir 0018).
  const stored = storedStatus(patch.status);
  const parts: [string, unknown[]][] = [
    ["status = ?", [stored.status]],
    ["substatus = ?", [stored.substatus]],
  ];
  // Dates remplies automatiquement si elles sont vides (modifiables ensuite).
  if (patch.status === "completed" && patch.completedAt === undefined) {
    parts.push(["completed_at = COALESCE(completed_at, date('now'))", []]);
  }
  if (patch.status === "in_progress" && patch.startedAt === undefined) {
    parts.push(["started_at = COALESCE(started_at, date('now'))", []]);
  }
  // Retour dans la watchlist / le backlog : pas encore commencée, donc pas de dates.
  if (patch.status === "planned" || patch.status === "wishlist") {
    if (patch.startedAt === undefined) parts.push(["started_at = NULL", []]);
    if (patch.completedAt === undefined) parts.push(["completed_at = NULL", []]);
  }
  return parts;
}

/** Une œuvre terminée ou abandonnée n'est plus « en ce moment ». */
const leavesFocus = (status: LibraryStatus | undefined) => status === "completed" || status === "played" || status === "dropped";

/** « Joué », « Envies » et 🏆 ne concernent que les jeux : la modification ne touche alors que des jeux. */
const gameOnly = (patch: EntryPatch) => (patch.status !== undefined && GAME_ONLY_STATUSES.includes(patch.status)) || patch.mastered !== undefined;

/**
 * Comics : passer en série suivie ou en numéros isolés, avec le statut qui va avec.
 *  - numéros isolés : « Lu (numéros isolés) » dès un numéro lu, backlog sinon (en pause / abandonnée : gardé) ;
 *  - série suivie : lue si tous ses numéros (série terminée) le sont, sinon en cours au prochain numéro non lu.
 * null si l'entrée n'existe pas ou n'est pas un comic.
 */
async function comicFollowParts(db: D1Database, entryId: number, follows: boolean): Promise<[string, unknown[]][] | null> {
  const [entryRows, readRows] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT l.status, l.media_type, m.total_chapters, m.is_ongoing FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.id = ? AND l.user_id = ?`,
      )
      .bind(entryId, CURRENT_USER_ID),
    db
      .prepare("SELECT DISTINCT chapter FROM progress_log WHERE entry_id = ? AND kind = 'chapter' AND chapter IS NOT NULL")
      .bind(entryId),
  ]);
  const entry = entryRows.results[0] as { status: LibraryStatus; media_type: MediaType; total_chapters: number | null; is_ongoing: number } | undefined;
  if (!entry || entry.media_type !== "comic") return null;
  const read = (readRows.results as { chapter: number }[]).map((r) => r.chapter);
  const parts: [string, unknown[]][] = [["follows_series = ?", [follows ? 1 : 0]]];
  if (entry.status === "on_hold" || entry.status === "dropped") return parts;
  if (!follows) {
    parts.push(read.length > 0 ? ["status = 'completed'", []] : ["status = 'planned'", []]);
    return parts;
  }
  if (read.length === 0) return [...parts, ["status = 'planned'", []], ["completed_at = NULL", []]];
  if (!entry.is_ongoing && allIssuesRead(read, entry.total_chapters)) return [...parts, ["status = 'completed'", []]];
  const next = nextUnreadIssue(read, Math.max(...read), entry.total_chapters) ?? Math.floor(Math.max(...read)) + 1;
  return [
    ...parts,
    ["status = 'in_progress'", []],
    ["completed_at = NULL", []],
    ["started_at = COALESCE(started_at, date('now'))", []],
    ["current_chapter = ?", [next]],
  ];
}

/** Applique les modifications ; renvoie false si l'entrée n'existe pas. */
export async function updateEntry(db: D1Database, entryId: number, patch: EntryPatch): Promise<boolean> {
  // Chaque morceau du SET avec ses paramètres, dans l'ordre des « ? ».
  const parts = statusParts(patch);
  if (patch.isFavorite !== undefined) parts.push(["is_favorite = ?", [patch.isFavorite ? 1 : 0]]);
  if (patch.rating !== undefined) parts.push(["rating = ?", [patch.rating]]);
  if (patch.review !== undefined) parts.push(["review = ?", [patch.review]]);
  if (patch.startedAt !== undefined) parts.push(["started_at = ?", [patch.startedAt]]);
  if (patch.completedAt !== undefined) parts.push(["completed_at = ?", [patch.completedAt]]);
  if (patch.customPosterUrl !== undefined) parts.push(["custom_poster_url = ?", [patch.customPosterUrl]]);
  if (patch.customBackdropUrl !== undefined) parts.push(["custom_backdrop_url = ?", [patch.customBackdropUrl]]);
  if (patch.backdropPosition !== undefined) parts.push(["backdrop_position = ?", [patch.backdropPosition]]);
  if (patch.mastered !== undefined) parts.push(["mastered = ?", [patch.mastered ? 1 : 0]]);
  if (patch.followsSeries !== undefined) {
    const follow = await comicFollowParts(db, entryId, patch.followsSeries);
    if (!follow) return false;
    parts.push(...follow);
  }
  if (parts.length === 0) return true;

  const update = db
    .prepare(
      `UPDATE library_entries SET ${parts.map(([sql]) => sql).join(", ")} WHERE id = ? AND user_id = ?${gameOnly(patch) ? " AND media_type = 'game'" : ""}`,
    )
    .bind(...parts.flatMap(([, params]) => params), entryId, CURRENT_USER_ID);
  const [result] = await db.batch(
    // Numéros isolés : plus de « prochain numéro », donc plus de focus.
    leavesFocus(patch.status) || patch.followsSeries === false ? [update, db.prepare("DELETE FROM focus WHERE entry_id = ?").bind(entryId)] : [update],
  );
  return (result.meta.changes ?? 0) > 0;
}

/** Nombre maximal d'œuvres modifiées d'un coup. */
export const BULK_MAX = 500;

/**
 * Sélection multiple : même statut et / ou favori pour plusieurs œuvres, en une requête
 * (les identifiants passent en un seul paramètre JSON, D1 limitant le nombre de paramètres).
 * Renvoie le nombre d'œuvres modifiées.
 */
export async function bulkUpdateEntries(
  db: D1Database,
  entryIds: number[],
  patch: Pick<EntryPatch, "status" | "isFavorite">,
): Promise<number> {
  const parts = statusParts(patch);
  if (patch.isFavorite !== undefined) parts.push(["is_favorite = ?", [patch.isFavorite ? 1 : 0]]);
  if (parts.length === 0 || entryIds.length === 0) return 0;
  const ids = JSON.stringify(entryIds.slice(0, BULK_MAX));
  const update = db
    .prepare(
      `UPDATE library_entries SET ${parts.map(([sql]) => sql).join(", ")}
       WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))${gameOnly(patch) ? " AND media_type = 'game'" : ""}`,
    )
    .bind(...parts.flatMap(([, params]) => params), CURRENT_USER_ID, ids);
  const statements = [update];
  if (leavesFocus(patch.status)) {
    statements.push(db.prepare("DELETE FROM focus WHERE user_id = ? AND entry_id IN (SELECT value FROM json_each(?))").bind(CURRENT_USER_ID, ids));
  }
  const [result] = await db.batch(statements);
  return result.meta.changes ?? 0;
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
  /** 1 : vu sans date. */
  undated?: number;
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
        `SELECT p.id, p.season, p.episode, p.note, p.logged_at AS at, p.rating, p.review, p.undated
         FROM progress_log p JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND m.type = 'tv' AND m.source = 'tmdb' AND m.external_id = ? AND p.kind = 'episode'
         ORDER BY p.logged_at DESC`,
      )
      .bind(CURRENT_USER_ID, externalId),
  ]);
  const m = media.results[0] as { title: string; original_title: string | null } | undefined;
  return { titles: m ? [m.title, m.original_title] : [], logs: logs.results as unknown as EpisodeLog[] };
}

/** Lectures des numéros d'un comic (journal, kind « chapter »), de la plus récente à la plus ancienne. */
export async function getIssueLogs(
  db: D1Database,
  externalId: string,
): Promise<{ id: number; chapter: number; at: string; rating: number | null; review: string | null; undated: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.chapter, p.logged_at AS at, p.rating, p.review, p.undated
       FROM progress_log p JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.type = 'comic' AND m.source = 'comicvine' AND m.external_id = ?
         AND p.kind = 'chapter' AND p.chapter IS NOT NULL
       ORDER BY p.logged_at DESC, p.id DESC`,
    )
    .bind(CURRENT_USER_ID, externalId)
    .all<{ id: number; chapter: number; at: string; rating: number | null; review: string | null; undated: number }>();
  return results;
}
