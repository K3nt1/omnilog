// POST /api/library/12/journal  { "date": "2026-10-20", "rating": 8, "review": "…", "tags": ["vo"] }
// Ajoute un visionnage au journal (film revu, série / animé / manga / jeu refait en entier).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { addJournalLine } from "@/lib/journal";
import { parseJournalPatch } from "@/lib/journal-input";

export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const patch = parseJournalPatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  const { env } = getCloudflareContext();
  const added = await addJournalLine(env.DB, entryId, patch);
  if (!added) return NextResponse.json({ error: "Œuvre absente de ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
