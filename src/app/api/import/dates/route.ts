// POST /api/import/dates  { "source": "letterboxd", "items": [{ "key": "https://boxd.it/2aIU", "date": "2021-03-14" }, ...] }
// Corrige la date d'ajout des œuvres déjà importées (avant la v0.4.0, c'était la date de l'import).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { backfillAddedDates } from "@/lib/library";
import { IMPORT_DATES_CHUNK } from "@/lib/import/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  let body: { source?: unknown; items?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { source?: unknown; items?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const { source, items } = body;
  if (source !== "letterboxd") return NextResponse.json({ error: "Source non gérée." }, { status: 400 });
  if (
    !Array.isArray(items) ||
    items.length > IMPORT_DATES_CHUNK ||
    !items.every(
      (i): i is { key: string; date: string } =>
        !!i && typeof i.key === "string" && i.key.length <= 500 && typeof i.date === "string" && DATE.test(i.date),
    )
  ) {
    return NextResponse.json({ error: `Au plus ${IMPORT_DATES_CHUNK} dates valides par appel.` }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const updated = await backfillAddedDates(env.DB, source, items);
  return NextResponse.json({ updated }, { headers: { "Cache-Control": "no-store" } });
}
