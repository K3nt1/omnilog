// POST /api/library/12/saisons  { "season": 2, "date": "2026-11-26", "rating": 8, "review": "…" }
// Note et / ou critique d'une saison (date null : « sans date »). Une saison peut en avoir plusieurs (revisionnages).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { parseJournalPatch } from "@/lib/journal-input";
import { addSeasonReview } from "@/lib/season-reviews";

export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const season = body.season;
  if (typeof season !== "number" || !Number.isInteger(season) || season < 1 || season > 1000) {
    return NextResponse.json({ error: "Saison invalide." }, { status: 400 });
  }
  const patch = parseJournalPatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  const { env } = getCloudflareContext();
  const result = await addSeasonReview(env.DB, entryId, season, patch);
  if (result === "empty") return NextResponse.json({ error: "Mets une note ou une critique." }, { status: 400 });
  if (result === "not_found") return NextResponse.json({ error: "Série absente de ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
