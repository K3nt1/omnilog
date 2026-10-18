// POST /api/import/undo  { "source": "letterboxd", "key": "https://boxd.it/2aIU", "refs": ["https://boxd.it/80SH1D"] }
// Annule une correspondance faite à l'import (mauvais film choisi dans l'écran de validation).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { undoImportLink } from "@/lib/library";

export async function POST(request: NextRequest) {
  let body: { source?: unknown; key?: unknown; refs?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { source?: unknown; key?: unknown; refs?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const { source, key, refs = [] } = body;
  if (source !== "letterboxd") return NextResponse.json({ error: "Source non gérée." }, { status: 400 });
  if (typeof key !== "string" || key.length === 0 || key.length > 500) {
    return NextResponse.json({ error: "Clé invalide." }, { status: 400 });
  }
  if (!Array.isArray(refs) || refs.length > 50 || !refs.every((r): r is string => typeof r === "string")) {
    return NextResponse.json({ error: "Références invalides." }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const undone = await undoImportLink(env.DB, source, key, refs);
  if (!undone) return NextResponse.json({ error: "Aucune correspondance à annuler." }, { status: 404 });
  return NextResponse.json({ undone: true }, { headers: { "Cache-Control": "no-store" } });
}
