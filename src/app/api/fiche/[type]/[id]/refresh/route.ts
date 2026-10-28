// POST /api/fiche/films/550/refresh
// Relit l'œuvre chez sa source et met à jour le catalogue (titres, affiche, épisodes, saisons, diffusion).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { refreshMedia } from "@/lib/fiche-actions";
import { typeFromSlug } from "@/lib/labels";
import { SourceError } from "@/lib/sources/http";

export async function POST(_request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: slug, id } = await params;
  const type = typeFromSlug(slug);
  if (!type || !/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Œuvre invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    await refreshMedia(env, type, id);
  } catch (error) {
    const message = error instanceof SourceError ? error.message : "La source n'a pas répondu.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ refreshed: true }, { headers: { "Cache-Control": "no-store" } });
}
