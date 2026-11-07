// POST /api/reminders { kind: "custom", label, daysOfWeek, timeOfDay } ou { kind: "media", entryId, … } : nouveau rappel.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { checkReminder, createReminder, parseReminderBody } from "@/lib/reminders";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const input = parseReminderBody(body);
  if (!input.kind) return NextResponse.json({ error: "Type de rappel invalide." }, { status: 400 });
  const error = checkReminder(input, true);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    const id = await createReminder(env.DB, input);
    return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Création impossible." }, { status: 404 });
  }
}
