// POST /api/library/possession  { "entryIds": [12, 13], "add": { "platform": "PS5", "format": "digital" } }
//                               { "entryIds": [12, 13], "removePlatform": "PS5" }
// Saisie en masse depuis la bibliothèque (mode sélection) : ajoute une possession à ces jeux, ou retire une plateforme.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { getVersions } from "@/lib/data-version";
import { addOwnershipToMany, getOwnedFacets, removePlatformFromMany } from "@/lib/ownership";
import { parseOwnership } from "@/lib/ownership-shared";

const MAX = 500;

// GET /api/library/possession → { owned: [{ value: "p:PS5", label: "PS5", count: 42 }, …] } (choix du tirage au sort)
export async function GET() {
  const { env } = getCloudflareContext();
  const owned = await getOwnedFacets(env.DB, await getVersions(env.DB));
  return NextResponse.json({ owned }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  let body: { entryIds?: unknown; add?: unknown; removePlatform?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const ids = body.entryIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: `Entre 1 et ${MAX} jeux.` }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  if (typeof body.removePlatform === "string" && body.removePlatform.trim()) {
    const changed = await removePlatformFromMany(env.DB, ids as number[], body.removePlatform.trim().slice(0, 60));
    return NextResponse.json({ changed }, { headers: { "Cache-Control": "no-store" } });
  }
  const o = parseOwnership(body.add);
  if (typeof o === "string") return NextResponse.json({ error: o }, { status: 400 });
  const changed = await addOwnershipToMany(env.DB, ids as number[], o);
  return NextResponse.json({ changed }, { headers: { "Cache-Control": "no-store" } });
}
