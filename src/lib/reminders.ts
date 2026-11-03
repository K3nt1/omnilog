// Rappels : la quête du jour (tes focus), les rappels sur une œuvre (« One Piece le dimanche à 18 h »)
// et les rappels libres (« Bonus de connexion Dokkan »). Leur heure est l'heure locale (users.timezone).
import { getFocusOverview } from "./browse";
import { ficheHref, positionLine } from "./labels";
import { CURRENT_USER_ID } from "./library";
import { localNow, minutesOf, type LocalNow } from "./local-time";
import { MEDIA_TYPES } from "./types";

export type ReminderKind = "daily_quest" | "media" | "custom";

export interface Reminder {
  id: number;
  kind: ReminderKind;
  entryId: number | null;
  label: string | null;
  daysOfWeek: number;
  timeOfDay: string;
  isActive: boolean;
  lastSentAt: string | null;
  /** Œuvre du rappel (rappel sur une œuvre). */
  work: { title: string; type: string; externalId: string | null; posterUrl: string | null } | null;
  /** État du jour sur la page Aujourd'hui. */
  todayStatus: "done" | "skipped" | null;
}

interface ReminderRow {
  id: number;
  kind: ReminderKind;
  entry_id: number | null;
  label: string | null;
  days_of_week: number;
  time_of_day: string;
  is_active: number;
  last_sent_at: string | null;
  title: string | null;
  media_type: string | null;
  external_id: string | null;
  poster_url: string | null;
  today_status: "done" | "skipped" | null;
}

/** Tous les rappels (la quête du jour d'abord, puis par heure), avec leur état du jour `date`. */
export async function listReminders(db: D1Database, date: string | null = null): Promise<Reminder[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.kind, r.entry_id, r.label, r.days_of_week, r.time_of_day, r.is_active, r.last_sent_at,
              m.title, l.media_type, m.external_id, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url,
              (SELECT e.status FROM reminder_events e WHERE e.reminder_id = r.id AND e.status <> 'pending'
                 AND substr(e.message, 1, 10) = ?2 ORDER BY e.id DESC LIMIT 1) AS today_status
       FROM reminders r
       LEFT JOIN library_entries l ON l.id = r.entry_id LEFT JOIN media m ON m.id = l.media_id
       WHERE r.user_id = ?1
       ORDER BY r.kind <> 'daily_quest', r.time_of_day, r.id`,
    )
    .bind(CURRENT_USER_ID, date ?? "")
    .all<ReminderRow>();
  return results.map((r) => ({
    id: r.id,
    kind: r.kind,
    entryId: r.entry_id,
    label: r.label,
    daysOfWeek: r.days_of_week,
    timeOfDay: r.time_of_day,
    isActive: r.is_active === 1,
    lastSentAt: r.last_sent_at,
    work: r.title ? { title: r.title, type: r.media_type ?? "", externalId: r.external_id, posterUrl: r.poster_url } : null,
    todayStatus: r.today_status,
  }));
}

export interface ReminderInput {
  kind?: "media" | "custom";
  entryId?: number | null;
  label?: string | null;
  daysOfWeek?: number;
  timeOfDay?: string;
  isActive?: boolean;
}

/** Corps de requête → rappel (les champs absents ou mal typés sont ignorés, puis checkReminder vérifie). */
export function parseReminderBody(body: Record<string, unknown>): ReminderInput {
  const input: ReminderInput = {};
  if (body.kind === "media" || body.kind === "custom") input.kind = body.kind;
  if (typeof body.entryId === "number") input.entryId = body.entryId;
  if (typeof body.label === "string" || body.label === null) input.label = body.label as string | null;
  if (typeof body.daysOfWeek === "number") input.daysOfWeek = body.daysOfWeek;
  if (typeof body.timeOfDay === "string") input.timeOfDay = body.timeOfDay;
  if (typeof body.isActive === "boolean") input.isActive = body.isActive;
  return input;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Vérifie un rappel envoyé par l'interface ; renvoie un message d'erreur ou null. */
export function checkReminder(input: ReminderInput, creating: boolean): string | null {
  if (input.timeOfDay !== undefined && !TIME.test(input.timeOfDay)) return "Heure invalide (HH:MM).";
  if (input.daysOfWeek !== undefined && !(Number.isInteger(input.daysOfWeek) && input.daysOfWeek >= 1 && input.daysOfWeek <= 127)) {
    return "Choisis au moins un jour.";
  }
  if (input.label !== undefined && input.label !== null && input.label.length > 120) return "Libellé trop long.";
  if (creating) {
    if (input.kind === "custom" && !input.label?.trim()) return "Donne un nom au rappel.";
    if (input.kind === "media" && !input.entryId) return "Œuvre manquante.";
    if (!input.timeOfDay) return "Heure manquante.";
  }
  return null;
}

export async function createReminder(db: D1Database, input: ReminderInput): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO reminders (user_id, kind, entry_id, label, days_of_week, time_of_day)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE ?3 IS NULL OR EXISTS (SELECT 1 FROM library_entries WHERE id = ?3 AND user_id = ?1)
       RETURNING id`,
    )
    .bind(
      CURRENT_USER_ID,
      input.kind,
      input.kind === "media" ? input.entryId : null,
      input.label?.trim() || null,
      input.daysOfWeek ?? 127,
      input.timeOfDay,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("Œuvre absente de ta bibliothèque.");
  return row.id;
}

export async function updateReminder(db: D1Database, id: number, input: ReminderInput): Promise<boolean> {
  const parts: [string, unknown][] = [];
  if (input.label !== undefined) parts.push(["label = ?", input.label?.trim() || null]);
  if (input.daysOfWeek !== undefined) parts.push(["days_of_week = ?", input.daysOfWeek]);
  if (input.timeOfDay !== undefined) parts.push(["time_of_day = ?", input.timeOfDay]);
  if (input.isActive !== undefined) parts.push(["is_active = ?", input.isActive ? 1 : 0]);
  if (parts.length === 0) return true;
  // Rappel libre : le nom reste obligatoire (contrainte de la table).
  const result = await db
    .prepare(`UPDATE reminders SET ${parts.map(([s]) => s).join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...parts.map(([, v]) => v), id, CURRENT_USER_ID)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Supprime un rappel (la quête du jour ne se supprime pas : elle se désactive). */
export async function deleteReminder(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM reminders WHERE id = ? AND user_id = ? AND kind <> 'daily_quest'")
    .bind(id, CURRENT_USER_ID)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * « Fait » ou « Passer » sur la page Aujourd'hui. Une ligne par rappel et par jour
 * (la date locale est en tête du message, ce qui évite une colonne de plus).
 */
export async function markReminder(db: D1Database, id: number, date: string, status: "done" | "skipped" | null): Promise<boolean> {
  const reminder = await db.prepare("SELECT entry_id FROM reminders WHERE id = ? AND user_id = ?").bind(id, CURRENT_USER_ID).first<{ entry_id: number | null }>();
  if (!reminder) return false;
  const statements = [
    db.prepare("DELETE FROM reminder_events WHERE reminder_id = ? AND substr(message, 1, 10) = ? AND status <> 'pending'").bind(id, date),
  ];
  if (status) {
    statements.push(
      db
        .prepare(
          `INSERT INTO reminder_events (reminder_id, entry_id, message, status, resolved_at)
           VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        )
        .bind(id, reminder.entry_id, `${date} ${status === "done" ? "fait" : "passé"}`, status),
    );
  }
  await db.batch(statements);
  return true;
}

/** Un rappel est dû s'il est actif, prévu ce jour-là, que son heure est passée depuis moins de 3 h, et pas encore envoyé aujourd'hui. */
export function isDue(r: Pick<Reminder, "isActive" | "daysOfWeek" | "timeOfDay" | "lastSentAt">, now: LocalNow, timeZone: string): boolean {
  if (!r.isActive || !(r.daysOfWeek & now.dayBit)) return false;
  const late = minutesOf(now.time) - minutesOf(r.timeOfDay);
  if (late < 0 || late > 180) return false;
  return !r.lastSentAt || localNow(timeZone, new Date(r.lastSentAt)).date !== now.date;
}

const VERB: Record<string, string> = { movie: "Film", tv: "Série", anime: "Anime", manga: "Manga", game: "Jeu" };

/** Texte de la quête du jour : un focus par type, avec où tu en es. */
export async function dailyQuestMessage(db: D1Database): Promise<{ title: string; body: string; url: string }> {
  const overview = await getFocusOverview(db);
  const lines = MEDIA_TYPES.flatMap((t) => {
    const card = overview.cards[t];
    if (!card) return [];
    const where = positionLine(card);
    return [`${card.title}${where ? ` (${where})` : ""}`];
  });
  return {
    title: "🎯 Quête du jour",
    body: lines.length > 0 ? lines.join(" · ") : "Rien en cours : tire une œuvre au sort dans ta watchlist ou ton backlog.",
    url: "/aujourdhui",
  };
}

/** Texte d'un rappel sur une œuvre ou d'un rappel libre. */
export async function reminderMessage(db: D1Database, r: Reminder): Promise<{ title: string; body: string; url: string; tag: string }> {
  if (r.kind === "custom" || !r.entryId) {
    return { title: `⏰ ${r.label ?? "Rappel"}`, body: "C'est l'heure ! Coche-le sur la page Aujourd'hui.", url: "/aujourdhui", tag: `rappel-${r.id}` };
  }
  const row = await db
    .prepare(
      `SELECT m.title, m.type, m.external_id, l.status, l.current_season, l.current_episode, l.current_chapter, l.current_volume,
              l.pause_seconds, l.pause_page
       FROM library_entries l JOIN media m ON m.id = l.media_id WHERE l.id = ?`,
    )
    .bind(r.entryId)
    .first<Record<string, unknown>>();
  if (!row) return { title: `⏰ ${r.label ?? "Rappel"}`, body: "", url: "/aujourdhui", tag: `rappel-${r.id}` };
  const type = row.type as "movie" | "tv" | "anime" | "manga" | "game";
  const where =
    row.status === "in_progress" || row.status === "on_hold"
      ? positionLine({
          type,
          status: row.status,
          currentSeason: row.current_season as number | null,
          currentEpisode: row.current_episode as number | null,
          currentChapter: row.current_chapter as number | null,
          currentVolume: row.current_volume as number | null,
          pauseSeconds: row.pause_seconds as number | null,
          pausePage: row.pause_page as number | null,
        })
      : "";
  return {
    title: `⏰ ${r.label?.trim() || `${VERB[type] ?? "Œuvre"} : ${row.title}`}`,
    body: [row.title as string, where].filter(Boolean).join(" · "),
    url: ficheHref(type, row.external_id as string | null),
    tag: `rappel-${r.id}`,
  };
}
