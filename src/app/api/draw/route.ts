// POST /api/draw  { "type": "movie" }
// Tire au sort une œuvre de la watchlist / du backlog du type ; elle devient le focus.
// Rappeler la route = « Relancer » : l'œuvre tirée avant (pas commencée) retourne dans la watchlist / le backlog.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { drawRandom } from "@/lib/progress";
import { isMediaType } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: { type?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { type?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (!isMediaType(body.type)) return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  const entryId = await drawRandom(env.DB, body.type);
  if (entryId === null) {
    return NextResponse.json({ error: "Rien à tirer au sort : la liste est vide." }, { status: 404 });
  }
  return NextResponse.json({ entryId }, { headers: { "Cache-Control": "no-store" } });
}
