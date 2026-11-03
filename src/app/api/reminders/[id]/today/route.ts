// POST /api/reminders/3/today { date: "2026-11-03", status: "done" | "skipped" | null } : « Fait » / « Passer » sur Aujourd'hui.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { markReminder } from "@/lib/reminders";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  let body: { date?: unknown; status?: unknown };
  try {
    body = (await request.json()) as { date?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const status = body.status === "done" || body.status === "skipped" ? body.status : body.status === null ? null : undefined;
  if (!Number.isInteger(id) || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || status === undefined) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  if (!(await markReminder(env.DB, id, body.date, status))) return NextResponse.json({ error: "Rappel introuvable." }, { status: 404 });
  return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
}
