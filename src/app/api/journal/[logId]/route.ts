// PATCH /api/journal/42  { "date": "2026-10-20", "rating": 8, "review": "…", "tags": [] }  → modifie une ligne du journal
// DELETE /api/journal/42                                                                 → la supprime
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { deleteJournalLine, updateJournalLine } from "@/lib/journal";
import { parseJournalPatch } from "@/lib/journal-input";

type Context = { params: Promise<{ logId: string }> };

async function logIdOf(context: Context): Promise<number | null> {
  const id = Number((await context.params).logId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, context: Context) {
  const logId = await logIdOf(context);
  if (!logId) return NextResponse.json({ error: "Ligne invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const patch = parseJournalPatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  const { env } = getCloudflareContext();
  const updated = await updateJournalLine(env.DB, logId, patch);
  if (!updated) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const logId = await logIdOf(context);
  if (!logId) return NextResponse.json({ error: "Ligne invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  const deleted = await deleteJournalLine(env.DB, logId);
  if (!deleted) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
