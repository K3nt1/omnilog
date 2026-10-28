// POST /api/library/12/rematch  { "externalId": "603" }
// « Ce n'est pas la bonne œuvre » : l'entrée passe sur une autre œuvre du même type, avec tout son suivi.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { RematchError, rematchEntry } from "@/lib/fiche-actions";
import { ficheHref } from "@/lib/labels";
import { SourceError } from "@/lib/sources/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: { externalId?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { externalId?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (typeof body.externalId !== "string" || !/^\d{1,12}$/.test(body.externalId)) {
    return NextResponse.json({ error: "Œuvre invalide." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  try {
    const moved = await rematchEntry(env, entryId, body.externalId);
    return NextResponse.json({ href: ficheHref(moved.type, moved.externalId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RematchError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof SourceError ? error.message : "Changement impossible pour l'instant.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
