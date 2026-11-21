// Calendrier : activités d'un mois (vue Mois) et nombre d'activités par jour (vue Année).
// Sources : le journal (progress_log, sans les pauses ni les activités sans date), les dates de fin saisies
// sur la fiche sans activité au journal ce jour-là, et les ajouts à la bibliothèque (vue Mois seulement).
// Comics en numéros isolés : leur « fin » n'est pas une lecture (la série n'est pas suivie), seuls leurs numéros comptent.
import {
  dayOf,
  groupByDay,
  longestStreak,
  vagueLabel,
  type CalendarAction,
  type CalendarActivity,
  type CalendarDay,
  type CalendarKind,
  type VagueRelease,
  type YearStats,
} from "./calendar-shared";
import { ficheHref } from "./labels";
import { CURRENT_USER_ID } from "./library";
import { localNow } from "./local-time";
import { parseRelease, type ReleasePrecision } from "./release-shared";
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

interface ReleaseRow {
  entry_id: number;
  media_type: MediaType;
  external_id: string | null;
  title: string;
  poster_url: string | null;
  release_json: string | null;
  release_date: string | null;
  precision: ReleasePrecision | null;
}

/**
 * Sorties à venir du mois : prochain épisode des séries et animes, prochain numéro des comics suivis (vus dans la
 * dernière vérification des sorties), date de sortie des films et jeux de ta watchlist ou de ton backlog.
 * Rien de passé : seulement à partir d'aujourd'hui. Les dates approximatives (date de couverture d'un comic,
 * jeu annoncé pour un mois, un trimestre ou une année) vont à part, dans le mois où la source les range.
 */
async function getReleases(
  db: D1Database,
  month: string,
  next: string,
  options: { timeZone: string; types: MediaType[]; today: string },
): Promise<{ activities: CalendarActivity[]; vague: VagueRelease[] }> {
  const activities: CalendarActivity[] = [];
  const vague: VagueRelease[] = [];
  if (next <= options.today) return { activities, vague };
  const { from, to } = widen(`${month}-01`, next);
  const types = typeFilter(options.types);
  const [series, dated] = await db.batch<ReleaseRow>([
    db
      .prepare(
        `SELECT l.id AS entry_id, ${WORK_COLUMNS}, m.release_json, NULL AS release_date, NULL AS precision
         FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND l.media_type IN ('tv', 'anime', 'comic') AND l.status <> 'dropped' AND l.follows_series = 1
           AND json_extract(m.release_json, '$.kind') = 'next'
           AND json_extract(m.release_json, '$.at') >= ? AND json_extract(m.release_json, '$.at') < ? ${types.sql}`,
      )
      .bind(CURRENT_USER_ID, from, to, ...types.params),
    db
      .prepare(
        `SELECT l.id AS entry_id, ${WORK_COLUMNS}, NULL AS release_json, m.release_date,
                json_extract(m.extra_json, '$.releasePrecision') AS precision
         FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND l.media_type IN ('movie', 'game') AND l.status = 'planned'
           AND m.release_date >= ? AND m.release_date < ? ${types.sql}`,
      )
      .bind(CURRENT_USER_ID, `${month}-01`, next, ...types.params),
  ]);
  const base = (row: ReleaseRow) => ({ entryId: row.entry_id, type: row.media_type, title: row.title, posterUrl: row.poster_url });
  const push = (row: ReleaseRow, day: string, label: string, time: string | null) => {
    if (day < options.today || !day.startsWith(month)) return;
    activities.push({
      ...base(row),
      externalId: row.external_id,
      kind: "release",
      day,
      season: null,
      episode: null,
      chapter: null,
      volume: null,
      minutes: null,
      note: null,
      rating: null,
      review: null,
      again: false,
      release: { label, time },
    });
  };
  const pushVague = (row: ReleaseRow, label: string, date: string, precision: Exclude<ReleasePrecision, "day">) => {
    if (date.startsWith(month)) vague.push({ ...base(row), href: ficheHref(row.media_type, row.external_id), label, when: vagueLabel(date, precision) });
  };

  for (const row of series.results) {
    const release = parseRelease(row.release_json);
    if (!release?.at) continue;
    if (release.approx) pushVague(row, release.label, release.at.slice(0, 10), "month");
    else push(row, dayOf(release.at, options.timeZone), release.label, release.precision === "time" ? localNow(options.timeZone, new Date(release.at)).time : null);
  }
  for (const row of dated.results) {
    if (!row.release_date) continue;
    if (row.precision && row.precision !== "day") pushVague(row, "", row.release_date, row.precision);
    else push(row, row.release_date.slice(0, 10), "", null);
  }
  return { activities, vague };
}

export interface MonthData {
  days: Map<string, CalendarDay>;
  /** Sorties du mois sans jour précis. */
  vague: VagueRelease[];
}

/** Activités du mois `month` (« 2026-11 ») rangées par jour local, et sorties à venir. */
export async function getMonth(
  db: D1Database,
  month: string,
  options: { timeZone: string; types: MediaType[]; action: CalendarAction; today?: string },
): Promise<MonthData> {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { from, to } = widen(first, next);
  const types = typeFilter(options.types);
  const inMonth = (day: string) => day >= first && day < next;
  const statements: D1PreparedStatement[] = [];

  if (options.action === "tout" || options.action === "vus") {
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
  if (options.action === "tout" || options.action === "ajouts") {
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

  const today = options.today ?? localNow(options.timeZone).date;
  const [results, releases] = await Promise.all([
    statements.length > 0 ? db.batch<LogRow>(statements) : Promise.resolve([]),
    options.action === "tout" || options.action === "sorties"
      ? getReleases(db, month, next, { timeZone: options.timeZone, types: options.types, today })
      : Promise.resolve({ activities: [], vague: [] }),
  ]);
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
  activities.push(...releases.activities);
  return { days: groupByDay(activities, importedAdds), vague: releases.vague };
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
