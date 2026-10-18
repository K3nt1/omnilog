// GET /api/search?q=dune&types=movie,tv,anime,manga,game
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { findLibraryStatuses } from "@/lib/library";
import { searchAll } from "@/lib/sources";
import { isMediaType, MEDIA_TYPES, type MediaType } from "@/lib/types";

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

function parseTypes(raw: string | null): Set<MediaType> {
  if (!raw) return new Set(MEDIA_TYPES);
  const types = raw.split(",").filter(isMediaType);
  return new Set(types.length > 0 ? types : MEDIA_TYPES);
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < MIN_LENGTH) {
    return NextResponse.json({ error: `Tape au moins ${MIN_LENGTH} caractères.` }, { status: 400 });
  }
  if (query.length > MAX_LENGTH) {
    return NextResponse.json({ error: "Recherche trop longue." }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const response = await searchAll(env, query, parseTypes(request.nextUrl.searchParams.get("types")));

  const statuses = await findLibraryStatuses(env.DB, response.results);
  for (const result of response.results) {
    result.libraryStatus = statuses.get(result.key) ?? null;
  }

  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
