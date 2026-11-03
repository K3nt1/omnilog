// POST /api/push/test : envoie une notification de test à tous tes appareils abonnés.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { pushConfigured, queueMessage, wakeDevices } from "@/lib/push";

export async function POST() {
  const { env } = getCloudflareContext();
  if (!pushConfigured(env)) return NextResponse.json({ error: "Clés VAPID manquantes." }, { status: 503 });
  await queueMessage(env.DB, { title: "🔔 Notification de test", body: "Les notifications d'Omnilog fonctionnent sur cet appareil.", url: "/reglages", tag: "test" });
  const devices = await wakeDevices(env);
  if (devices === 0) return NextResponse.json({ error: "Aucun appareil abonné n'a répondu." }, { status: 404 });
  return NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
}
