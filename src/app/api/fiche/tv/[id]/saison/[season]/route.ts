// GET /api/fiche/tv/19885/saison/2
// Épisodes d'une saison (TMDB, en direct) avec, pour chacun, ton visionnage s'il existe.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getEpisodeLogs } from "@/lib/entry";
import { matchEpisodes } from "@/lib/fiche/episodes";
import { getTmdbSeason } from "@/lib/fiche/tmdb";
import { SourceError } from "@/lib/sources/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; season: string }> }) {
  const { id, season: rawSeason } = await params;
  const season = Number(rawSeason);
  if (!/^\d{1,12}$/.test(id) || !Number.isInteger(season) || season < 0 || season > 500) {
    return NextResponse.json({ error: "Saison invalide." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  try {
    const [episodes, { titles, logs }] = await Promise.all([
      getTmdbSeason(env.TMDB_API_TOKEN, id, season),
      getEpisodeLogs(env.DB, id),
    ]);

    const result = matchEpisodes(episodes, season, titles, logs);
    return NextResponse.json({ episodes: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 404 ? 404 : 502 });
    }
    console.error("Saison en échec", id, season, error);
    return NextResponse.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
