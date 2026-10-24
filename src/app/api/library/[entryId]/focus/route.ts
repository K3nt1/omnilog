// POST /api/library/12/focus  { "focus": true }
// Met une œuvre en focus (« En ce moment ») ou le lui retire. Un seul focus par type.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { setFocus } from "@/lib/progress";

export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: { focus?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { focus?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (typeof body.focus !== "boolean") return NextResponse.json({ error: "Valeur invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  const done = await setFocus(env.DB, entryId, body.focus);
  if (!done) return NextResponse.json({ error: "Œuvre absente de ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
