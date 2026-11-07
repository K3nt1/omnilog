// PATCH /api/settings { timezone?, timezoneAuto?, watchRegion?, newsKinds? } : modifie les réglages.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { setNewsKinds } from "@/lib/news";
import { updateSettings, type Settings } from "@/lib/settings";

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const patch: Partial<Settings> = {};
  if ("timezone" in body) patch.timezone = String(body.timezone);
  if ("timezoneAuto" in body) {
    if (typeof body.timezoneAuto !== "boolean") return NextResponse.json({ error: "Valeur invalide." }, { status: 400 });
    patch.timezoneAuto = body.timezoneAuto;
  }
  if ("watchRegion" in body) patch.watchRegion = String(body.watchRegion);
  const { env } = getCloudflareContext();
  if ("newsKinds" in body) {
    const mask = body.newsKinds;
    if (!(typeof mask === "number" && Number.isInteger(mask) && mask >= 0 && mask <= 63)) {
      return NextResponse.json({ error: "Types de nouveautés invalides." }, { status: 400 });
    }
    await setNewsKinds(env.DB, mask);
  }
  const error = await updateSettings(env.DB, patch);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
}
