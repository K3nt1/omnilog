// Bilan de l'année (« Wrapped ») : calculé à partir du journal, gardé quelques heures dans source_cache.
// Le jour de chaque activité est calculé en SQL dans ton fuseau (décalages de l'année passés en paramètres),
// pour ne pas convertir des milliers de dates une à une dans le Worker (10 ms de CPU sur le plan gratuit).
import {
  streakOf,
  weekdayOf,
  type BilanData,
  type BilanSeason,
  type BilanType,
  type BilanWork,
} from "./bilan-shared";
import { ficheHref } from "./labels";
import { CURRENT_USER_ID } from "./library";
import { localNow } from "./local-time";
import { cachedVersioned, getVersions } from "./data-version";
import { MEDIA_TYPES, type MediaType } from "./types";

/** Décalage (minutes) du fuseau à un instant donné. */
function offsetAt(timeZone: string, at: Date): number {
  const local = localNow(timeZone, at);
  const asUtc = Date.parse(`${local.date}T${local.time}:00Z`);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Périodes de l'année à décalage constant (heure d'hiver / d'été), à l'heure près :
 * [{ from: instant UTC de début (null = avant tout), offset: minutes }].
 */
export function offsetSegments(year: number, timeZone: string): { from: string | null; offset: number }[] {
  const at = (t: number) => offsetAt(timeZone, new Date(t));
  const start = Date.UTC(year - 1, 11, 31);
  const segments: { from: string | null; offset: number }[] = [{ from: null, offset: at(start) }];
  // Mois par mois, puis jour par jour et heure par heure là où le décalage change (deux fois par an au plus).
  let previous = start;
  for (let month = 0; month <= 12; month++) {
    const t = Date.UTC(year, month, 1);
    const offset = at(t);
    if (offset !== segments[segments.length - 1].offset) {
      let day = previous;
      while (at(day + 86400_000) === segments[segments.length - 1].offset) day += 86400_000;
      let hour = day;
      while (at(hour + 3600_000) === segments[segments.length - 1].offset) hour += 3600_000;
      segments.push({ from: new Date(hour + 3600_000).toISOString(), offset });
    }
    previous = t;
  }
  return segments;
}

/** Expression SQL du jour local de `column` (les dates sans heure gardent leur jour, comme dans le calendrier). */
function daySql(column: string, segments: { from: string | null; offset: number }[]): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = [];
  let offset = "";
  if (segments.length === 1) {
    offset = "?";
    params.push(`${segments[0].offset >= 0 ? "+" : ""}${segments[0].offset} minutes`);
  } else {
    // Du plus récent au plus ancien : le premier début dépassé donne le décalage.
    offset = "CASE";
    for (const s of [...segments].reverse()) {
      const value = `${s.offset >= 0 ? "+" : ""}${s.offset} minutes`;
      if (s.from) {
        offset += ` WHEN ${column} >= ? THEN ?`;
        params.push(s.from, value);
      } else {
        offset += ` ELSE ?`;
        params.push(value);
      }
    }
    offset += " END";
  }
  const sql = `CASE WHEN length(${column}) = 10 THEN ${column}
    WHEN ${column} GLOB '*T00:00:00Z' OR ${column} GLOB '*T00:00:00.000Z' OR ${column} GLOB '*T12:00:00Z' OR ${column} GLOB '*T12:00:00.000Z'
      THEN substr(${column}, 1, 10)
    ELSE date(${column}, ${offset}) END`;
  return { sql, params };
}

interface Row {
  e: number; // entrée
  t: MediaType;
  k: string; // kind
  d: string; // jour local
  mn: number | null; // minutes
  a: number; // déjà fait avant
}

interface SeasonRow {
  e: number; // entrée
  s: number; // saison
  rt: number; // note
  d: string; // jour local
  nm: string | null; // nom TMDB de la saison
}

/** Les 5 saisons les mieux notées ; à note égale, la plus récemment notée d'abord. */
function topSeasons(latest: Map<string, SeasonRow>, toWork: (id: number) => BilanWork | null): BilanSeason[] {
  return [...latest.values()]
    .sort((x, y) => y.rt - x.rt || (x.d < y.d ? 1 : x.d > y.d ? -1 : 0))
    .flatMap((r) => {
      const work = toWork(r.e);
      return work ? [{ work, season: r.s, name: r.nm, rating: r.rt }] : [];
    })
    .slice(0, 5);
}

interface WorkRow {
  id: number;
  media_type: MediaType;
  rating: number | null;
  list_status: string;
  title: string;
  poster_url: string | null;
  external_id: string | null;
}

/** Calcul complet du bilan (sans cache). */
export async function computeBilan(db: D1Database, year: number, timeZone: string): Promise<BilanData> {
  const first = `${year}-01-01`;
  const next = `${year + 1}-01-01`;
  const from = new Date(Date.parse(`${first}T00:00:00Z`) - 86400_000).toISOString();
  const to = new Date(Date.parse(`${next}T00:00:00Z`) + 86400_000).toISOString();
  const day = daySql("r.logged_at", offsetSegments(year, timeZone));

  const [logs, completions, seasonRows] = await db.batch<Row & SeasonRow>([
    // « Déjà fait avant » : rang du même épisode / chapitre / film / fin dans tout l'historique de l'œuvre.
    db
      .prepare(
        `WITH active AS (
           SELECT DISTINCT p.entry_id FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
           WHERE +l.user_id = ? AND p.undated = 0 AND p.kind <> 'pause' AND p.logged_at >= ? AND p.logged_at < ?
         ),
         ranked AS (
           SELECT p.id, p.entry_id, p.kind, p.logged_at, p.undated, p.duration_minutes,
                  ROW_NUMBER() OVER (PARTITION BY p.entry_id, p.kind, p.season, p.episode, p.chapter, p.volume
                                     ORDER BY p.logged_at, p.id) AS nth
           FROM progress_log p WHERE p.entry_id IN (SELECT entry_id FROM active) AND p.kind <> 'pause'
         ),
         dated AS (
           SELECT r.*, ${day.sql} AS d FROM ranked r WHERE r.undated = 0 AND r.logged_at >= ? AND r.logged_at < ?
         )
         SELECT x.entry_id AS e, l.media_type AS t, x.kind AS k, x.d,
                COALESCE(x.duration_minutes, CASE WHEN x.kind IN ('movie', 'episode') THEN m.runtime_minutes END) AS mn,
                (x.nth > 1 AND x.kind <> 'session') AS a
         FROM dated x JOIN library_entries l ON l.id = x.entry_id JOIN media m ON m.id = l.media_id
         WHERE x.d >= ? AND x.d < ?
         ORDER BY x.d, x.logged_at, x.id`,
      )
      .bind(CURRENT_USER_ID, from, to, ...day.params, from, to, first, next),
    // Dates de fin saisies sans activité au journal ce jour-là (comme le calendrier).
    db
      .prepare(
        `SELECT l.id AS e, l.media_type AS t, 'complete' AS k, substr(l.completed_at, 1, 10) AS d, NULL AS mn, 0 AS a
         FROM library_entries l
         WHERE +l.user_id = ? AND l.completed_at >= ? AND l.completed_at < ?
           AND NOT (l.media_type = 'comic' AND l.follows_series = 0) AND l.substatus IS NOT 'played'
           AND NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = l.id AND p.kind IN ('complete', 'movie')
                           AND substr(p.logged_at, 1, 10) = substr(l.completed_at, 1, 10))`,
      )
      .bind(CURRENT_USER_ID, first, next),
    // Saisons notées dans l'année (datées), avec leur nom TMDB : la note la plus récente de chaque saison compte.
    db
      .prepare(
        `WITH dated AS (
           SELECT r.id, r.entry_id, r.season, r.rating, r.logged_at, ${day.sql} AS d
           FROM season_reviews r JOIN library_entries l ON l.id = r.entry_id
           WHERE +l.user_id = ? AND r.undated = 0 AND r.rating IS NOT NULL AND r.logged_at >= ? AND r.logged_at < ?
         )
         SELECT x.entry_id AS e, x.season AS s, x.rating AS rt, x.d, ms.name AS nm
         FROM dated x JOIN library_entries l ON l.id = x.entry_id
         LEFT JOIN media_seasons ms ON ms.media_id = l.media_id AND ms.season_number = x.season
         WHERE x.d >= ? AND x.d < ?
         ORDER BY x.logged_at DESC, x.id DESC`,
      )
      .bind(...day.params, CURRENT_USER_ID, from, to, first, next),
  ]);
  const rows = [...logs.results, ...completions.results].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));

  // Note la plus récente de chaque saison (une saison revue et renotée ne compte qu'une fois).
  const latestSeason = new Map<string, SeasonRow>();
  for (const r of seasonRows.results as SeasonRow[]) if (!latestSeason.has(`${r.e}:${r.s}`)) latestSeason.set(`${r.e}:${r.s}`, r);
  const ids = [...new Set([...rows.map((r) => r.e), ...[...latestSeason.values()].map((r) => r.e)])];
  const works = new Map<number, WorkRow>();
  if (ids.length > 0) {
    const { results } = await db
      .prepare(
        `SELECT l.id, l.media_type, l.rating, l.list_status, m.title, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url, m.external_id
         FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.id IN (SELECT value FROM json_each(?)) AND +l.user_id = ?`,
      )
      .bind(JSON.stringify(ids), CURRENT_USER_ID)
      .all<WorkRow>();
    for (const w of results) works.set(w.id, w);
  }
  const toWork = (id: number): BilanWork | null => {
    const w = works.get(id);
    return w
      ? { entryId: w.id, type: w.media_type, title: w.title, posterUrl: w.poster_url, href: ficheHref(w.media_type, w.external_id), rating: w.rating }
      : null;
  };

  const months = Array.from({ length: 12 }, () => Object.fromEntries(MEDIA_TYPES.map((t) => [t, 0])) as Record<MediaType, number>);
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const allDays = new Set<string>();
  const perType = new Map<
    MediaType,
    { rows: Row[]; days: Set<string>; activityByEntry: Map<number, number>; againByEntry: Map<number, number>; completed: Set<number> }
  >();
  for (const r of rows) {
    let t = perType.get(r.t);
    if (!t) {
      t = { rows: [], days: new Set(), activityByEntry: new Map(), againByEntry: new Map(), completed: new Set() };
      perType.set(r.t, t);
    }
    t.rows.push(r);
    t.days.add(r.d);
    t.activityByEntry.set(r.e, (t.activityByEntry.get(r.e) ?? 0) + 1);
    if (r.a) t.againByEntry.set(r.e, (t.againByEntry.get(r.e) ?? 0) + 1);
    if ((r.k === "complete" || r.k === "movie") && works.get(r.e)?.list_status !== "played") t.completed.add(r.e);
    allDays.add(r.d);
    months[Number(r.d.slice(5, 7)) - 1][r.t]++;
    weekdays[weekdayOf(r.d)]++;
  }

  const types: BilanType[] = [];
  for (const type of MEDIA_TYPES) {
    const t = perType.get(type);
    if (!t) continue;
    const units = { movies: 0, episodes: 0, chapters: 0, volumes: 0, sessions: 0 };
    let minutes = 0;
    let missing = 0;
    for (const r of t.rows) {
      if (r.k === "movie") units.movies++;
      else if (r.k === "episode") units.episodes++;
      else if (r.k === "chapter") units.chapters++;
      else if (r.k === "volume") units.volumes++;
      else if (r.k === "session") units.sessions++;
      if (r.mn) minutes += r.mn;
      else if (r.k === "movie" || r.k === "episode") missing++;
    }
    const rated = [...t.activityByEntry.keys()]
      .map((id) => ({ work: toWork(id), activities: t.activityByEntry.get(id) ?? 0 }))
      .filter((w): w is { work: BilanWork; activities: number } => w.work !== null && w.work.rating !== null)
      .sort((x, y) => y.work.rating! - x.work.rating! || y.activities - x.activities || x.work.title.localeCompare(y.work.title, "fr"));
    const lowest = rated.length > 1 ? [...rated].sort((x, y) => x.work.rating! - y.work.rating! || y.activities - x.activities)[0] : null;
    const againWorks = [...t.againByEntry.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([id]) => toWork(id))
      .filter((w): w is BilanWork => w !== null);
    const firstRow = t.rows[0];
    const lastRow = t.rows[t.rows.length - 1];
    const firstWork = toWork(firstRow.e);
    const lastWork = toWork(lastRow.e);
    const reading = type === "manga" || type === "comic";
    types.push({
      type,
      activities: t.rows.length,
      works: t.activityByEntry.size,
      minutes: reading ? null : minutes,
      missingDurations: reading ? 0 : missing,
      units,
      completed: t.completed.size,
      top: rated.slice(0, 5).map((w) => w.work),
      ...(type === "tv" ? { topSeasons: topSeasons(latestSeason, toWork) } : {}),
      worst: lowest && lowest.work.rating! < rated[0].work.rating! ? lowest.work : null,
      streak: streakOf(t.days),
      first: firstWork ? { work: firstWork, day: firstRow.d } : null,
      last: lastWork ? { work: lastWork, day: lastRow.d } : null,
      again: { activities: [...t.againByEntry.values()].reduce((a, b) => a + b, 0), works: againWorks },
    });
  }

  const monthTotals = months.map((m) => Object.values(m).reduce((a, b) => a + b, 0));
  const busiestMonth = monthTotals.some((n) => n > 0) ? monthTotals.indexOf(Math.max(...monthTotals)) : -1;
  const busiestWeekday = weekdays.some((n) => n > 0) ? weekdays.indexOf(Math.max(...weekdays)) : -1;
  return {
    year,
    types,
    totals: {
      activities: rows.length,
      works: ids.length,
      completed: types.reduce((n, t) => n + t.completed, 0),
      activeDays: allDays.size,
      minutes: types.reduce((n, t) => n + (t.minutes ?? 0), 0),
    },
    streak: streakOf(allDays),
    months,
    busiestMonth: busiestMonth >= 0 ? { month: busiestMonth, activities: monthTotals[busiestMonth] } : null,
    busiestWeekday: busiestWeekday >= 0 ? { weekday: busiestWeekday, activities: weekdays[busiestWeekday] } : null,
    weekdays,
  };
}

/** Bilan de l'année, gardé jusqu'au prochain changement du journal ou de la bibliothèque. */
export async function getBilan(db: D1Database, year: number, timeZone: string): Promise<BilanData> {
  const v = await getVersions(db);
  return cachedVersioned(db, `bilan:${year}:${timeZone}`, [v.journal, v.library], () => computeBilan(db, year, timeZone));
}

/** Années avec au moins une activité datée (sélecteur d'années). */
export async function bilanYears(db: D1Database): Promise<number[]> {
  const v = await getVersions(db);
  return cachedVersioned(db, "bilan:annees", [v.journal], async () => {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT CAST(substr(p.logged_at, 1, 4) AS INTEGER) AS y FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
         WHERE l.user_id = ? AND p.undated = 0 AND p.kind <> 'pause' ORDER BY y`,
      )
      .bind(CURRENT_USER_ID)
      .all<{ y: number }>();
    return results.map((r) => r.y).filter((y) => y >= 1970);
  });
}
