// GET /api/push/pending?endpoint=… : ce que l'appareil réveillé doit afficher (appelé par le service worker).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { pendingMessages } from "@/lib/push";

export async function GET(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  const { env } = getCloudflareContext();
  const messages = await pendingMessages(env.DB, endpoint && endpoint.length < 1000 ? endpoint : null);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
