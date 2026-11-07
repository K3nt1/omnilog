// Tâche programmée (toutes les 15 minutes, voir wrangler.jsonc et custom-worker.ts) :
// 1. rappels dus (quête du jour, rappels sur une œuvre, rappels libres) → messages + notification ;
// 2. une fois par heure, rafraîchissement des prochaines sorties des œuvres en diffusion
//    (nouveaux épisodes, chapitres, saisons) ;
// 3. aux autres quarts d'heure, nouveautés lentes : plateformes, saisons des séries terminées, suites, DLC.
// Plan gratuit : 10 ms de CPU et 50 appels sortants par exécution, d'où des petits lots.
import { localNow } from "./local-time";
import { checkDueNews } from "./news";
import { pushConfigured, queueMessage, wakeDevices, type PushEnv } from "./push";
import { refreshDueReleases } from "./release";
import { dailyQuestMessage, isDue, listReminders, reminderMessage } from "./reminders";
import { getSettings } from "./settings";

export interface CronReport {
  sent: number;
  devices: number;
  refreshed: number;
  /** Œuvres vérifiées pour les nouveautés lentes (plateformes, saisons, suites, DLC). */
  checked: number;
}

/** Envoie les rappels dus maintenant ; renvoie le nombre de messages créés. */
export async function sendDueReminders(env: CloudflareEnv & PushEnv, at = new Date()): Promise<{ sent: number; devices: number }> {
  const { timezone } = await getSettings(env.DB);
  const now = localNow(timezone, at);
  const due = (await listReminders(env.DB)).filter((r) => isDue(r, now, timezone));
  if (due.length === 0) return { sent: 0, devices: 0 };
  for (const r of due) {
    const message =
      r.kind === "daily_quest" ? { ...(await dailyQuestMessage(env.DB, r.lastSentAt)), tag: "quete-du-jour" } : await reminderMessage(env.DB, r);
    await queueMessage(env.DB, message);
  }
  // Marqués envoyés même sans appareil abonné : ils restent visibles sur la page Aujourd'hui.
  await env.DB.prepare(`UPDATE reminders SET last_sent_at = ? WHERE id IN (${due.map(() => "?").join(", ")})`)
    .bind(at.toISOString(), ...due.map((r) => r.id))
    .run();
  const devices = pushConfigured(env) ? await wakeDevices(env) : 0;
  return { sent: due.length, devices };
}

export async function runScheduled(env: CloudflareEnv & PushEnv, at = new Date()): Promise<CronReport> {
  const { sent, devices } = await sendDueReminders(env, at);
  // Les sorties : une fois par heure suffit (exécution de la minute 0).
  const refreshed = at.getUTCMinutes() < 15 ? await refreshDueReleases(env) : 0;
  // Les autres exécutions (minutes 15, 30, 45) : nouveautés lentes, par petits lots.
  const checked = at.getUTCMinutes() >= 15 ? await checkDueNews(env, 8, at.getTime()) : 0;
  // Ménage : les messages de plus de 30 jours.
  if (at.getUTCHours() === 3 && at.getUTCMinutes() < 15) {
    await env.DB.prepare("DELETE FROM push_messages WHERE created_at < ?").bind(new Date(at.getTime() - 30 * 86400_000).toISOString()).run();
  }
  return { sent, devices, refreshed, checked };
}
