// PUT /api/library/12/possession  { "ownership": [{ "platform": "PS5", "format": "physical" }, …] }
// Remplace les plateformes où tu possèdes ce jeu.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { setOwnership } from "@/lib/ownership";
import { parseOwnership, type Ownership } from "@/lib/ownership-shared";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: { ownership?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { ownership?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (!Array.isArray(body.ownership) || body.ownership.length > 50) return NextResponse.json({ error: "Liste invalide." }, { status: 400 });
  const list: Ownership[] = [];
  for (const item of body.ownership) {
    const o = parseOwnership(item);
    if (typeof o === "string") return NextResponse.json({ error: o }, { status: 400 });
    list.push(o);
  }
  const { env } = getCloudflareContext();
  if (!(await setOwnership(env.DB, entryId, list))) return NextResponse.json({ error: "Jeu absent de ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
