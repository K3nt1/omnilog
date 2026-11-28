// POST /api/manuel  { "type": "game", "title": "Kahoot!", "release": "2013", "posterUrl": "https://…", "status": "played", … }
// Crée une œuvre absente de sa source et l'ajoute à ta bibliothèque. Renvoie son adresse de fiche.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { createManualWork, parseManualInput } from "@/lib/manual";
import { isLibraryStatus, statusesFor } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const input = parseManualInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const status = body.status ?? "planned";
  if (!isLibraryStatus(status) || !statusesFor(input.type).includes(status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  const created = await createManualWork(env.DB, input, status);
  return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
}
