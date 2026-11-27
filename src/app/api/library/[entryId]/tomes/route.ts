// GET /api/library/12/tomes → { volumes: [{ volume: 1, first: 1, last: 8 }, …] }
// Tomes d'un manga et leurs chapitres d'après MangaDex (gardés un jour), pour la molette tome / chapitre.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { entryVolumes } from "@/lib/manga";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    return NextResponse.json({ volumes: await entryVolumes(env.DB, entryId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Tomes MangaDex indisponibles", entryId, error);
    // Sans MangaDex, la molette marche quand même : le chapitre ne suit simplement pas le tome.
    return NextResponse.json({ volumes: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
