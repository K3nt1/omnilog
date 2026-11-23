// Page Aujourd'hui : rappels du jour et sorties des 7 prochains jours (à l'heure locale).
import { CARD_COLUMNS_SQL, cardFromRow, type LibraryCard } from "./browse";
import { cachedVersioned, getVersions } from "./data-version";
import { CURRENT_USER_ID } from "./library";
import { localNow } from "./local-time";
import { listReminders, type Reminder } from "./reminders";
import { displayRelease } from "./release-shared";
import { getSettings } from "./settings";

export interface TodayData {
  date: string;
  timezone: string;
  reminders: Reminder[];
  /** Sorties du jour et des 6 jours suivants, dans l'ordre ; et derniers chapitres parus hier ou aujourd'hui. */
  releases: { card: LibraryCard; day: string }[];
}

/** Jour local (AAAA-MM-JJ) d'une sortie : une date seule est déjà un jour, une heure exacte se convertit. */
function releaseDay(at: string, precision: "day" | "time", timeZone: string): string {
  return precision === "day" ? at.slice(0, 10) : localNow(timeZone, new Date(at)).date;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

async function ongoingRows(db: D1Database): Promise<Record<string, unknown>[]> {
  const rows = await db
    .prepare(
      // Part des œuvres en diffusion (index partiel idx_media_ongoing) : quelques centaines de lignes au plus,
      // au lieu de toute la bibliothèque.
      `SELECT ${CARD_COLUMNS_SQL} FROM media m INDEXED BY idx_media_ongoing JOIN library_entries l ON l.media_id = m.id
       WHERE m.is_ongoing = 1 AND m.release_json IS NOT NULL AND +l.user_id = ? AND l.status <> 'dropped'`,
    )
    .bind(CURRENT_USER_ID)
    .all();
  return rows.results as Record<string, unknown>[];
}

export async function getToday(db: D1Database, at = new Date()): Promise<TodayData> {
  const { timezone } = await getSettings(db);
  const today = localNow(timezone, at);
  const versions = await getVersions(db);
  const [reminders, rows] = await Promise.all([
    listReminders(db, today.date),
    // Œuvres en diffusion : gardées une heure au plus (les sorties sont rafraîchies chaque heure), ou jusqu'au
    // prochain changement de la bibliothèque ou du journal.
    cachedVersioned(db, "aujourdhui:diffusion", [versions.library, versions.journal], () => ongoingRows(db), 3600_000),
  ]);  const until = addDays(today.date, 6);
  const yesterday = addDays(today.date, -1);
  const releases = rows
    .map(cardFromRow)
    .flatMap((card) => {
      const r = displayRelease(card.release);
      if (!r?.at) return [];
      const day = releaseDay(r.at, r.precision, timezone);
      const keep = r.kind === "next" ? day >= today.date && day <= until : day >= yesterday && day <= today.date;
      return keep ? [{ card, day }] : [];
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.card.title.localeCompare(b.card.title));
  return {
    date: today.date,
    timezone,
    reminders: reminders.filter((r) => r.kind !== "daily_quest" && r.isActive && r.daysOfWeek & today.dayBit),
    releases,
  };
}
