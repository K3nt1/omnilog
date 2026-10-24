// POST /api/import/backfill  { "source": "letterboxd", "items": [{ "key", "addedDate", "name", "refs" }, ...] }
// Complète un import Letterboxd fait avant la v0.4.0 : dates d'ajout, noms des épisodes de séries.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { backfillLetterboxd, type LetterboxdBackfillItem } from "@/lib/library";
import { IMPORT_BACKFILL_CHUNK } from "@/lib/import/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isString = (v: unknown, max = 500): v is string => typeof v === "string" && v.length <= max;

function isItem(v: unknown): v is LetterboxdBackfillItem {
  const i = v as LetterboxdBackfillItem;
  return (
    !!i &&
    isString(i.key) &&
    (i.addedDate === null || (isString(i.addedDate) && DATE.test(i.addedDate))) &&
    isString(i.name, 300) &&
    Array.isArray(i.refs) &&
    i.refs.length <= 50 &&
    i.refs.every((r) => isString(r))
  );
}

export async function POST(request: NextRequest) {
  let body: { source?: unknown; items?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { source?: unknown; items?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const { source, items } = body;
  if (source !== "letterboxd") return NextResponse.json({ error: "Source non gérée." }, { status: 400 });
  if (!Array.isArray(items) || items.length > IMPORT_BACKFILL_CHUNK || !items.every(isItem)) {
    return NextResponse.json({ error: `Au plus ${IMPORT_BACKFILL_CHUNK} entrées valides par appel.` }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const done = await backfillLetterboxd(env.DB, items);
  return NextResponse.json(done, { headers: { "Cache-Control": "no-store" } });
}
