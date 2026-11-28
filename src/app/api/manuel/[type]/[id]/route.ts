// PATCH /api/manuel/game/m123456789012  { "title": "…", "release": "1996", … }
// Modifie une œuvre ajoutée à la main (seulement si elle est dans ta bibliothèque).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { typeFromSlug } from "@/lib/labels";
import { parseManualInput, updateManualWork } from "@/lib/manual";
import { isManualId } from "@/lib/types";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: slug, id } = await params;
  const type = typeFromSlug(slug);
  if (!type || !isManualId(id)) return NextResponse.json({ error: "Œuvre invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const input = parseManualInput(body, type);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const { env } = getCloudflareContext();
  if (!(await updateManualWork(env.DB, id, input))) return NextResponse.json({ error: "Œuvre introuvable dans ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
