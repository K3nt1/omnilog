// POST /api/settings/timezone { timezone } : fuseau du navigateur, enregistré si le mode automatique est actif.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { syncBrowserTimeZone } from "@/lib/settings";

export async function POST(request: NextRequest) {
  let timezone: unknown;
  try {
    timezone = ((await request.json()) as { timezone?: unknown }).timezone;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  const changed = await syncBrowserTimeZone(env.DB, String(timezone));
  return NextResponse.json({ changed }, { headers: { "Cache-Control": "no-store" } });
}
