// GET /api/library/counts : nombre d'œuvres par type, pour le menu « Bibliothèque » de la navigation.
// Appelé seulement à l'ouverture du menu (une fois par page), pas à chaque affichage.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { CURRENT_USER_ID } from "@/lib/library";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";

export async function GET() {
  const { env } = getCloudflareContext();
  const { results } = await env.DB.prepare("SELECT media_type, COUNT(*) AS n FROM library_entries WHERE user_id = ? GROUP BY media_type")
    .bind(CURRENT_USER_ID)
    .all<{ media_type: MediaType; n: number }>();
  const counts = Object.fromEntries(MEDIA_TYPES.map((t) => [t, results.find((r) => r.media_type === t)?.n ?? 0])) as Record<MediaType, number>;
  return NextResponse.json(
    { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
