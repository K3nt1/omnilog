// PATCH /api/reminders/3 { timeOfDay?, daysOfWeek?, label?, isActive? } ; DELETE /api/reminders/3.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { checkReminder, deleteReminder, parseReminderBody, updateReminder } from "@/lib/reminders";

type Params = { params: Promise<{ id: string }> };

const idOf = async (params: Params["params"]) => {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "Rappel invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const input = parseReminderBody(body);
  const error = checkReminder(input, false);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { env } = getCloudflareContext();
  try {
    if (!(await updateReminder(env.DB, id, input))) return NextResponse.json({ error: "Rappel introuvable." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Un rappel libre doit garder un nom." }, { status: 400 });
  }
  return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "Rappel invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  if (!(await deleteReminder(env.DB, id))) return NextResponse.json({ error: "Rappel introuvable." }, { status: 404 });
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
