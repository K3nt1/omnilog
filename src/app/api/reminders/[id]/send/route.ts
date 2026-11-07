// POST /api/reminders/3/send : envoie ce rappel tout de suite (pour essayer, sans attendre son heure).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { pushConfigured, queueMessage, wakeDevices } from "@/lib/push";
import { dailyQuestMessage, listReminders, reminderMessage } from "@/lib/reminders";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { env } = getCloudflareContext();
  const reminder = (await listReminders(env.DB)).find((r) => r.id === id);
  if (!reminder) return NextResponse.json({ error: "Rappel introuvable." }, { status: 404 });
  if (!pushConfigured(env)) return NextResponse.json({ error: "Clés VAPID manquantes." }, { status: 503 });
  const message = reminder.kind === "daily_quest" ? await dailyQuestMessage(env.DB) : await reminderMessage(env.DB, reminder);
  await queueMessage(env.DB, message);
  const devices = await wakeDevices(env);
  if (devices === 0) return NextResponse.json({ error: "Aucun appareil abonné n'a répondu." }, { status: 404 });
  return NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
}
