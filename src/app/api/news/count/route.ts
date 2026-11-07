// GET /api/news/count → { count } : nouveautés pas encore vues (pastille du menu).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { countUnseenNews } from "@/lib/news";

export async function GET() {
  const { env } = getCloudflareContext();
  return NextResponse.json({ count: await countUnseenNews(env.DB) }, { headers: { "Cache-Control": "no-store" } });
}
