// GET /api/fiche/films/550/images → { posters: [...], backdrops: [...] }
// Affiches et images de fond proposées par la source, pour choisir une image personnalisée.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { sourceImages } from "@/lib/fiche-actions";
import { typeFromSlug } from "@/lib/labels";
import { SourceError } from "@/lib/sources/http";

export async function GET(_request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: slug, id } = await params;
  const type = typeFromSlug(slug);
  if (!type || !/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Œuvre invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    return NextResponse.json(await sourceImages(env, type, id), { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    const message = error instanceof SourceError ? error.message : "La source n'a pas répondu.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
