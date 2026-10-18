// POST /api/import/check  { "source": "letterboxd", "keys": ["https://boxd.it/2aIU", ...] }
// Renvoie les entrées de l'export qui n'ont aucune correspondance en base (films manquants).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { findImportLinks } from "@/lib/library";
import { IMPORT_CHECK_CHUNK, type ImportCheckResponse } from "@/lib/import/types";

export async function POST(request: NextRequest) {
  let body: { source?: unknown; keys?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { source?: unknown; keys?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const { source, keys } = body;
  if (source !== "letterboxd" && source !== "mal") {
    return NextResponse.json({ error: "Source inconnue." }, { status: 400 });
  }
  if (
    !Array.isArray(keys) ||
    keys.length > IMPORT_CHECK_CHUNK ||
    !keys.every((k): k is string => typeof k === "string" && k.length <= 500)
  ) {
    return NextResponse.json({ error: `Au plus ${IMPORT_CHECK_CHUNK} clés par appel.` }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const found = await findImportLinks(env.DB, source, keys);
  const response: ImportCheckResponse = { missing: keys.filter((k) => !found.has(k)) };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
