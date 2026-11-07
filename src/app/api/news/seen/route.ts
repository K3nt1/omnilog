// POST /api/news/seen { ids?: number[] } : marque des nouveautés comme vues (toutes sans `ids`).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { markNewsSeen } from "@/lib/news";

export async function POST(request: NextRequest) {
  let body: { ids?: unknown } = {};
  try {
    body = ((await request.json()) ?? {}) as { ids?: unknown };
  } catch {
    body = {};
  }
  const ids = body.ids;
  if (ids !== undefined && !(Array.isArray(ids) && ids.length <= 500 && ids.every((i) => Number.isInteger(i) && i > 0))) {
    return NextResponse.json({ error: "Nouveautés invalides." }, { status: 400 });
  }
  const { env } = getCloudflareContext();
  const seen = await markNewsSeen(env.DB, ids as number[] | undefined);
  return NextResponse.json({ seen }, { headers: { "Cache-Control": "no-store" } });
}
