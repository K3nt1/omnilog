// PATCH /api/saisons/42  { "date": "2026-11-26", "rating": 8, "review": "…" }  → modifie la note / critique d'une saison
// DELETE /api/saisons/42                                                      → la supprime
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { parseJournalPatch } from "@/lib/journal-input";
import { deleteSeasonReview, updateSeasonReview } from "@/lib/season-reviews";

type Context = { params: Promise<{ reviewId: string }> };

async function idOf(context: Context): Promise<number | null> {
  const id = Number((await context.params).reviewId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, context: Context) {
  const id = await idOf(context);
  if (!id) return NextResponse.json({ error: "Critique invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const patch = parseJournalPatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  const { env } = getCloudflareContext();
  const result = await updateSeasonReview(env.DB, id, patch);
  if (result === "empty") return NextResponse.json({ error: "Mets une note ou une critique." }, { status: 400 });
  if (result === "not_found") return NextResponse.json({ error: "Critique introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const id = await idOf(context);
  if (!id) return NextResponse.json({ error: "Critique invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  if (!(await deleteSeasonReview(env.DB, id))) return NextResponse.json({ error: "Critique introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
