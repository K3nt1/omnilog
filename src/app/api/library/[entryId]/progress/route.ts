// POST /api/library/12/progress  { "kind": "episode" } | { "kind": "pause", "seconds": 4350 } | { "kind": "session", "minutes": 90, "note": "…" } | { "kind": "undo" } …
// Progression sur une œuvre : épisode vu, chapitre lu, session de jeu, pause, fin, position, annulation.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { ProgressError, recordProgress, type ProgressAction } from "@/lib/progress";
import { focusNextInSeries } from "@/lib/sequel";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : undefined);

/** Vérifie et normalise l'action envoyée. */
function parseAction(body: Record<string, unknown>): ProgressAction | null {
  switch (body.kind) {
    case "pause":
      return { kind: "pause", seconds: int(body.seconds), page: int(body.page) };
    case "clearPause":
    case "undo":
      return { kind: body.kind };
    case "episode":
    case "chapter":
      return { kind: body.kind, date: date(body.date) };
    case "position":
      return { kind: "position", season: int(body.season), episode: int(body.episode), chapter: num(body.chapter) };
    case "session":
      return {
        kind: "session",
        date: date(body.date),
        minutes: int(body.minutes),
        note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
      };
    case "complete": {
      const rating = body.rating === null ? null : int(body.rating);
      if (rating !== undefined && rating !== null && (rating < 1 || rating > 10)) return null;
      return {
        kind: "complete",
        date: date(body.date),
        rating,
        review: typeof body.review === "string" ? body.review.slice(0, 20000) : undefined,
      };
    }
    default:
      return null;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const action = parseAction(body);
  if (!action) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });

  const { env } = getCloudflareContext();
  try {
    const result = await recordProgress(env.DB, entryId, action);
    if (!result) {
      const message = action.kind === "undo" ? "Rien à annuler." : "Œuvre absente de ta bibliothèque.";
      return NextResponse.json({ error: message }, { status: 404 });
    }
    // Film d'une saga ou saison d'animé terminé alors qu'il était le focus : le focus passe à la suite.
    const next =
      result.completed && result.wasFocus && result.externalId
        ? await focusNextInSeries(env, result.type, result.externalId)
        : null;
    return NextResponse.json({ ok: true, next }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProgressError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
