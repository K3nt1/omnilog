// GET /api/fiche/comics/18166/numeros?page=2     → une page de numéros (100, une requête Comic Vine)
// GET /api/fiche/comics/18166/numeros?autour=742 → la page qui contient sans doute le n° 742
// GET /api/fiche/comics/18166/numeros?numero=742 → ce numéro seulement (une requête, sans charger la liste)
// Chaque numéro est renvoyé avec ta lecture la plus récente, s'il y en a une.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { getIssueLogs } from "@/lib/entry";
import { matchIssues } from "@/lib/fiche/issues";
import { findComicVineIssue, getComicVineIssuePage } from "@/lib/sources/comicvine";
import { SourceError } from "@/lib/sources/http";

/** Numéro tel qu'on le tape : « 742 », « 1.5 », « Annual 1 ». Pas de virgule ni de deux-points (syntaxe des filtres). */
const NUMBER_INPUT = /^[\p{L}\p{N} ._½-]{1,20}$/u;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Série invalide." }, { status: 400 });
  const query = request.nextUrl.searchParams;
  const numero = query.get("numero")?.trim().replace(/^#/, "");
  if (numero !== undefined && !NUMBER_INPUT.test(numero)) return NextResponse.json({ error: "Numéro invalide." }, { status: 400 });
  const pageParam = query.get("page");
  const around = query.get("autour");
  const page = pageParam !== null ? Number(pageParam) : null;
  if (page !== null && (!Number.isInteger(page) || page < 0 || page > 1000)) return NextResponse.json({ error: "Page invalide." }, { status: 400 });
  const aroundNumber = around !== null ? Number(around) : 1;
  if (!Number.isFinite(aroundNumber) || aroundNumber < 0) return NextResponse.json({ error: "Numéro invalide." }, { status: 400 });

  const { env } = getCloudflareContext();
  try {
    const logsPromise = getIssueLogs(env.DB, id);
    // Numéros différents déjà lus dans toute la série (pas seulement la page affichée).
    const readCount = (logs: Awaited<typeof logsPromise>) => new Set(logs.map((l) => l.chapter)).size;
    if (numero !== undefined) {
      const [issues, logs] = await Promise.all([findComicVineIssue(env, id, numero), logsPromise]);
      return NextResponse.json({ issues: matchIssues(issues, logs), readCount: readCount(logs) }, { headers: { "Cache-Control": "no-store" } });
    }
    const [result, logs] = await Promise.all([getComicVineIssuePage(env, id, page ?? { around: aroundNumber }), logsPromise]);
    return NextResponse.json(
      { issues: matchIssues(result.issues, logs), page: result.page, pages: result.pages, total: result.total, readCount: readCount(logs) },
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
