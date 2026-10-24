// PATCH /api/media/42  { "publisherFr": "Glénat" }
// Infos saisies à la main sur une œuvre : pour l'instant, l'éditeur français d'un manga.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { setPublisherFr } from "@/lib/entry";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const mediaId = Number((await params).mediaId);
  if (!Number.isInteger(mediaId) || mediaId <= 0) return NextResponse.json({ error: "Œuvre invalide." }, { status: 400 });

  let body: { publisherFr?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { publisherFr?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const value = body.publisherFr;
  if (value !== null && !(typeof value === "string" && value.length <= 200)) {
    return NextResponse.json({ error: "Éditeur invalide." }, { status: 400 });
  }
  const publisher = typeof value === "string" && value.trim() ? value.trim() : null;

  const { env } = getCloudflareContext();
  const updated = await setPublisherFr(env.DB, mediaId, publisher);
  if (!updated) return NextResponse.json({ error: "Manga introuvable." }, { status: 404 });
  return NextResponse.json({ publisherFr: publisher }, { headers: { "Cache-Control": "no-store" } });
}
