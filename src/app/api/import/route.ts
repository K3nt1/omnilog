// POST /api/import  { "source": "letterboxd" | "mal" | "locg" | "backloggd", "items": [...] }
// Reçoit un petit paquet d'œuvres (voir IMPORT_BATCH_SIZE) et renvoie le résultat de chacune.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { importBackloggdBatch } from "@/lib/import/backloggd-server";
import { importLetterboxdBatch, importLocgBatch, importMalBatch } from "@/lib/import/server";
import { IMPORT_BATCH_SIZE, type BackloggdGame, type ImportResponse, type LetterboxdFilm, type LocgSeries, type MalImportItem } from "@/lib/import/types";
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

function isLocgSeries(v: unknown): v is LocgSeries {
  const s = v as LocgSeries;
  return (
    !!s &&
    isString(s.key) &&
    s.key.startsWith("locg:") &&
    s.key.length <= 400 &&
    isString(s.name) &&
    s.name.length > 0 &&
    s.name.length <= 300 &&
    isString(s.label) &&
    isNullableString(s.publisher) &&
    isNullableNumber(s.startYear) &&
    Array.isArray(s.issues) &&
    s.issues.length <= 1000 &&
    s.issues.every((i) => typeof i.number === "number" && i.number >= 0 && typeof i.read === "boolean" && isNullableNumber(i.rating)) &&
    (s.forceComicId === undefined || (isString(s.forceComicId) && /^\d{1,12}$/.test(s.forceComicId)))
  );
}

function isBackloggdGame(v: unknown): v is BackloggdGame {
  const g = v as BackloggdGame;
  return (
    !!g &&
    isString(g.slug) &&
    /^[a-z0-9][a-z0-9-]{0,150}$/.test(g.slug) &&
    g.key === `bkl:${g.slug}` &&
    (g.gameId === null || (Number.isSafeInteger(g.gameId) && g.gameId > 0)) &&
    isString(g.title) &&
    g.title.length <= 300 &&
    isLibraryStatus(g.status) &&
    (g.rating === null || (Number.isInteger(g.rating) && g.rating >= 1 && g.rating <= 10)) &&
    typeof g.mastered === "boolean" &&
    Array.isArray(g.sessions) &&
    g.sessions.length <= 2000 &&
    g.sessions.every(
      (s) =>
        isString(s.date) &&
        /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
        (s.minutes === null || (Number.isInteger(s.minutes) && s.minutes > 0 && s.minutes <= 24 * 60)),
    )
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
  if (source !== "mal" && source !== "letterboxd" && source !== "locg" && source !== "backloggd") {
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
  if (source === "backloggd") {
    if (!items.every(isBackloggdGame)) return NextResponse.json({ error: "Jeu Backloggd invalide." }, { status: 400 });
    response = { results: await importBackloggdBatch(env, items) };
  } else if (source === "locg") {
    if (!items.every(isLocgSeries)) return NextResponse.json({ error: "Série League of Comic Geeks invalide." }, { status: 400 });
    response = { results: await importLocgBatch(env, items) };
  } else if (source === "mal") {
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
