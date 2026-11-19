// Calendrier : activités d'un mois (vue Mois) et nombre d'activités par jour (vue Année).
// Sources : le journal (progress_log, sans les pauses ni les activités sans date), les dates de fin saisies
// sur la fiche sans activité au journal ce jour-là, et les ajouts à la bibliothèque (vue Mois seulement).
// Comics en numéros isolés : leur « fin » n'est pas une lecture (la série n'est pas suivie), seuls leurs numéros comptent.
import {
  dayOf,
  groupByDay,
  longestStreak,
  type CalendarAction,
  type CalendarActivity,
  type CalendarDay,
  type CalendarKind,
  type YearStats,
} from "./calendar-shared";
import { CURRENT_USER_ID } from "./library";
import { MEDIA_TYPES, type MediaType } from "./types";

/** Fenêtre UTC large d'un jour de chaque côté : les heures locales sont rangées ensuite dans le bon jour. */
const widen = (from: string, to: string) => ({
  from: new Date(Date.parse(`${from}T00:00:00Z`) - 86400_000).toISOString(),
  to: new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000).toISOString(),
});

const typeFilter = (types: MediaType[]) =>
  types.length === MEDIA_TYPES.length ? { sql: "", params: [] as string[] } : { sql: `AND l.media_type IN (${types.map(() => "?").join(", ")})`, params: types };

/** Déjà fait avant (même épisode, même numéro, film déjà vu, œuvre déjà terminée) : « revu / relu / rejoué ». */
const AGAIN_SQL = `EXISTS (
  SELECT 1 FROM progress_log q
  WHERE q.entry_id = p.entry_id AND q.kind = p.kind AND p.kind <> 'session'
    AND q.season IS p.season AND q.episode IS p.episode AND q.chapter IS p.chapter AND q.volume IS p.volume
    AND (q.logged_at < p.logged_at OR (q.logged_at = p.logged_at AND q.id < p.id)))`;

interface LogRow {
  entry_id: number;
  kind: CalendarKind;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  volume: number | null;
  duration_minutes: number | null;
  note: string | null;
  at: string;
  rating: number | null;
  review: string | null;
  again: number;
  media_type: MediaType;
  external_id: string | null;
  title: string;
  poster_url: string | null;
}

const WORK_COLUMNS = `l.media_type, m.external_id, m.title, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url`;

/** Activités du mois `month` (« 2026-11 ») rangées par jour local. */
export async function getMonth(
  db: D1Database,
  month: string,
  options: { timeZone: string; types: MediaType[]; action: CalendarAction },
): Promise<Map<string, CalendarDay>> {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { from, to } = widen(first, next);
  const types = typeFilter(options.types);
  const inMonth = (day: string) => day >= first && day < next;
  const statements: D1PreparedStatement[] = [];

  if (options.action !== "ajouts") {
    statements.push(
      db
        .prepare(
          `SELECT p.entry_id, p.kind, p.season, p.episode, p.chapter, p.volume, p.duration_minutes, p.note,
                  p.logged_at AS at, p.rating, p.review, ${AGAIN_SQL} AS again, ${WORK_COLUMNS}
           FROM progress_log p JOIN library_entries l ON l.id = p.entry_id JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ? AND p.undated = 0 AND p.kind <> 'pause' AND p.logged_at >= ? AND p.logged_at < ? ${types.sql}
           ORDER BY p.logged_at, p.id`,
        )
        .bind(CURRENT_USER_ID, from, to, ...types.params),
      // Date de fin saisie sur la fiche, sans visionnage ni « Terminé » au journal ce jour-là.
      db
        .prepare(
          `SELECT l.id AS entry_id, 'complete' AS kind, NULL AS season, NULL AS episode, NULL AS chapter, NULL AS volume,
                  NULL AS duration_minutes, NULL AS note, l.completed_at AS at, NULL AS rating, NULL AS review, 0 AS again, ${WORK_COLUMNS}
           FROM library_entries l JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ? AND l.completed_at >= ? AND l.completed_at < ? ${types.sql}
             AND NOT (l.media_type = 'comic' AND l.follows_series = 0)
             AND NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id AND p.kind IN ('complete', 'movie')
                             AND substr(p.logged_at, 1, 10) = substr(l.completed_at, 1, 10))`,
        )
        .bind(CURRENT_USER_ID, first, next, ...types.params),
    );
  }
  if (options.action !== "vus") {
    // Ajout fait par un import sans date d'origine : l'œuvre a été créée en même temps que son lien d'import.
    statements.push(
      db
        .prepare(
          `SELECT l.id AS entry_id, 'add' AS kind, NULL AS season, NULL AS episode, NULL AS chapter, NULL AS volume,
                  NULL AS duration_minutes, NULL AS note, l.created_at AS at, NULL AS rating, NULL AS review,
                  EXISTS (SELECT 1 FROM import_links il WHERE il.media_id = l.media_id
                          AND abs(julianday(il.created_at) - julianday(l.created_at)) < 0.002) AS again,
                  ${WORK_COLUMNS}
           FROM library_entries l JOIN media m ON m.id = l.media_id
           WHERE l.user_id = ? AND l.created_at >= ? AND l.created_at < ? ${types.sql}
           ORDER BY l.created_at`,
        )
        .bind(CURRENT_USER_ID, from, to, ...types.params),
    );
  }

  const results = statements.length > 0 ? await db.batch<LogRow>(statements) : [];
  const activities: CalendarActivity[] = [];
  const importedAdds = new Map<string, number>();
  for (const row of results.flatMap((r) => r.results)) {
    const day = dayOf(row.at, options.timeZone);
    if (!inMonth(day)) continue;
    // Pour un ajout, « again » signifie « fait par un import » : compté à part, en une ligne.
    if (row.kind === "add" && row.again) {
      importedAdds.set(day, (importedAdds.get(day) ?? 0) + 1);
      continue;
    }
    activities.push({
      entryId: row.entry_id,
      type: row.media_type,
      externalId: row.external_id,
      title: row.title,
      posterUrl: row.poster_url,
      kind: row.kind,
      day,
      season: row.season,
      episode: row.episode,
      chapter: row.chapter,
      volume: row.volume,
      minutes: row.duration_minutes,
      note: row.note,
      rating: row.rating,
      review: row.review,
      again: row.kind !== "add" && row.again === 1,
    });
  }
  return groupByDay(activities, importedAdds);
}

/** Vue Année : activités vu / lu / joué par jour (sans les ajouts), totaux par type, jours actifs, plus longue série. */
export async function getYear(db: D1Database, year: number, options: { timeZone: string; types: MediaType[] }): Promise<YearStats> {
  const first = `${year}-01-01`;
  const next = `${year + 1}-01-01`;
  const { from, to } = widen(first, next);
  const types = typeFilter(options.types);
  const [logs, completions, undated] = await db.batch<{ at: string; media_type: MediaType; n?: number }>([
    db
      .prepare(
        `SELECT p.logged_at AS at, l.media_type FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
         WHERE l.user_id = ? AND p.undated = 0 AND p.kind <> 'pause' AND p.logged_at >= ? AND p.logged_at < ? ${types.sql}`,
      )
      .bind(CURRENT_USER_ID, from, to, ...types.params),
    db
      .prepare(
        `SELECT l.completed_at AS at, l.media_type FROM library_entries l
         WHERE l.user_id = ? AND l.completed_at >= ? AND l.completed_at < ? ${types.sql}
           AND NOT (l.media_type = 'comic' AND l.follows_series = 0)
             AND NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id AND p.kind IN ('complete', 'movie')
                           AND substr(p.logged_at, 1, 10) = substr(l.completed_at, 1, 10))`,
      )
      .bind(CURRENT_USER_ID, first, next, ...types.params),
    db
      .prepare(
        `SELECT '' AS at, '' AS media_type, COUNT(*) AS n FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
         WHERE l.user_id = ? AND p.undated = 1 AND p.kind <> 'pause' ${types.sql}`,
      )
      .bind(CURRENT_USER_ID, ...types.params),
  ]);
  const counts: Record<string, number> = {};
  const byType = Object.fromEntries(MEDIA_TYPES.map((t) => [t, 0])) as Record<MediaType, number>;
  let total = 0;
  for (const row of [...logs.results, ...completions.results]) {
    const day = dayOf(row.at, options.timeZone);
    if (day < first || day >= next) continue;
    counts[day] = (counts[day] ?? 0) + 1;
    byType[row.media_type] += 1;
    total++;
  }
  return {
    year,
    counts,
    byType,
    total,
    activeDays: Object.keys(counts).length,
    longestStreak: longestStreak(Object.keys(counts)),
    undated: undated.results[0]?.n ?? 0,
  };
}
