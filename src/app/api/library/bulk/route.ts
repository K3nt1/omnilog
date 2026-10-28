// POST /api/library/bulk  { "entryIds": [12, 13], "status": "completed" }  ou  { "entryIds": [...], "isFavorite": true }
// Sélection multiple de la bibliothèque : même statut et / ou favori pour plusieurs œuvres d'un coup.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { BULK_MAX, bulkUpdateEntries } from "@/lib/entry";
import { isLibraryStatus, type LibraryStatus } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const ids = body.entryIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_MAX || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: `Sélection invalide (1 à ${BULK_MAX} œuvres).` }, { status: 400 });
  }
  const patch: { status?: LibraryStatus; isFavorite?: boolean } = {};
  if ("status" in body) {
    if (!isLibraryStatus(body.status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    patch.status = body.status;
  }
  if ("isFavorite" in body) {
    if (typeof body.isFavorite !== "boolean") return NextResponse.json({ error: "Favori invalide." }, { status: 400 });
    patch.isFavorite = body.isFavorite;
  }
  if (patch.status === undefined && patch.isFavorite === undefined) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  const updated = await bulkUpdateEntries(env.DB, [...new Set(ids as number[])], patch);
  return NextResponse.json({ updated }, { headers: { "Cache-Control": "no-store" } });
}
