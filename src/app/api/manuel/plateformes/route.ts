// GET /api/manuel/plateformes → { platforms: ["PC", "PS5", "Switch", …] }
// Plateformes des jeux de ta bibliothèque (celles du filtre), pour un jeu ajouté à la main.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getGamePlatforms } from "@/lib/browse";

export async function GET() {
  const { env } = getCloudflareContext();
  return NextResponse.json({ platforms: await getGamePlatforms(env.DB) }, { headers: { "Cache-Control": "private, no-store" } });
}
