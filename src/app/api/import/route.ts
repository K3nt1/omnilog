// POST /api/import  { "source": "letterboxd" | "mal", "items": [...] }
// Reçoit un petit paquet d'œuvres (voir IMPORT_BATCH_SIZE) et renvoie le résultat de chacune.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { importLetterboxdBatch, importMalBatch } from "@/lib/import/server";
import { IMPORT_BATCH_SIZE, type ImportResponse, type LetterboxdFilm, type MalImportItem } from "@/lib/import/types";
import { isLibraryStatus } from "@/lib/types";

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown) => v === null || isString(v);
const isNullableNumber = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

function isMalItem(v: unknown): v is MalImportItem {
  const i = v as MalImportItem;
  return (
    !!i &&
    isString(i.key) &&
    (i.kind === "anime" || i.kind === "manga") &&
    isString(i.malId) &&
    /^\d{1,10}$/.test(i.malId) &&
    isString(i.title) &&
    isLibraryStatus(i.status) &&
    isNullableNumber(i.score) &&
    typeof i.progress === "number" &&
    (i.volumes === undefined || typeof i.volumes === "number") &&
    isNullableNumber(i.total) &&
    isNullableString(i.startDate) &&
    isNullableString(i.finishDate)
  );
}

function isLetterboxdFilm(v: unknown): v is LetterboxdFilm {
  const f = v as LetterboxdFilm;
  return (
    !!f &&
    isString(f.key) &&
    isNullableString(f.uri) &&
    isString(f.name) &&
    f.name.length <= 300 &&
    isNullableNumber(f.year) &&
    (f.status === "completed" || f.status === "planned") &&
    isNullableNumber(f.rating) &&
    typeof f.liked === "boolean" &&
    isNullableString(f.addedDate) &&
    Array.isArray(f.watches) &&
    f.watches.length <= 50 &&
    f.watches.every(
      (w) =>
        isString(w.ref) &&
        isNullableString(w.watchedDate) &&
        isNullableNumber(w.rating) &&
        typeof w.rewatch === "boolean" &&
        Array.isArray(w.tags) &&
        w.tags.every(isString) &&
        isNullableString(w.review),
    ) &&
    (f.forceTmdbId === undefined || (isString(f.forceTmdbId) && /^\d{1,10}$/.test(f.forceTmdbId))) &&
    (f.forceType === undefined || f.forceType === "movie" || f.forceType === "tv") &&
    (f.allowMerge === undefined || typeof f.allowMerge === "boolean")
  );
}

export async function POST(request: NextRequest) {
  let body: { source?: unknown; items?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { source?: unknown; items?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const { source, items } = body ?? {};
  if (source !== "mal" && source !== "letterboxd") {
    return NextResponse.json({ error: "Source inconnue." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > IMPORT_BATCH_SIZE[source]) {
    return NextResponse.json(
      { error: `Entre 1 et ${IMPORT_BATCH_SIZE[source]} éléments par paquet.` },
      { status: 400 },
    );
  }

  const { env } = getCloudflareContext();
  let response: ImportResponse;
  if (source === "mal") {
    if (!items.every(isMalItem)) return NextResponse.json({ error: "Élément MAL invalide." }, { status: 400 });
    response = { results: await importMalBatch(env, items) };
  } else {
    if (!items.every(isLetterboxdFilm)) {
      return NextResponse.json({ error: "Élément Letterboxd invalide." }, { status: 400 });
    }
    response = { results: await importLetterboxdBatch(env, items) };
  }
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
