// GET /api/push/key → { publicKey } : clé publique VAPID, pour abonner cet appareil aux notifications.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";

export async function GET() {
  const { env } = getCloudflareContext();
  if (!pushConfigured(env)) {
    return NextResponse.json({ error: "Notifications pas encore configurées (clés VAPID manquantes)." }, { status: 503 });
  }
  return NextResponse.json({ publicKey: env.VAPID_PUBLIC_KEY });
}
