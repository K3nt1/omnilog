// Page Aujourd'hui : rappels du jour et sorties des 7 prochains jours (à l'heure locale).
import { CARD_COLUMNS_SQL, cardFromRow, type LibraryCard } from "./browse";
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

export async function getToday(db: D1Database, at = new Date()): Promise<TodayData> {
  const { timezone } = await getSettings(db);
  const today = localNow(timezone, at);
  const [reminders, rows] = await Promise.all([
    listReminders(db, today.date),
    db
      .prepare(
        `SELECT ${CARD_COLUMNS_SQL} FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.user_id = ? AND m.release_json IS NOT NULL AND m.is_ongoing = 1 AND l.status <> 'dropped'`,
      )
      .bind(CURRENT_USER_ID)
      .all(),
  ]);
  const until = addDays(today.date, 6);
  const yesterday = addDays(today.date, -1);
  const releases = (rows.results as Record<string, unknown>[])
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
