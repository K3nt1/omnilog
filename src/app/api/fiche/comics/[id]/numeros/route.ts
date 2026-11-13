// GET /api/fiche/comics/18166/numeros
// Numéros d'une série (Comic Vine, en direct) avec, pour chacun, ta lecture si elle existe.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getIssueLogs } from "@/lib/entry";
import { matchIssues } from "@/lib/fiche/issues";
import { getComicVineIssues, MAX_ISSUES } from "@/lib/sources/comicvine";
import { SourceError } from "@/lib/sources/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Série invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    const [issues, logs] = await Promise.all([getComicVineIssues(env.COMICVINE_API_KEY, id, null), getIssueLogs(env.DB, id)]);
    return NextResponse.json(
      { issues: matchIssues(issues, logs), truncated: issues.length >= MAX_ISSUES },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 404 ? 404 : 502 });
    }
    console.error("Numéros en échec", id, error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Erreur inattendue : ${detail}` }, { status: 500 });
  }
}
