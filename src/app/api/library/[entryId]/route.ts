// PATCH /api/library/12  { "status": "completed", "rating": 9, "isFavorite": true, "review": "…", "startedAt": "2026-10-01", "completedAt": null }
// Modifie ton suivi d'une œuvre depuis sa fiche. Seuls les champs envoyés sont modifiés.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { updateEntry, type EntryPatch } from "@/lib/entry";
import { isLibraryStatus } from "@/lib/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown) => v === null || (typeof v === "string" && DATE.test(v));

/** Vérifie le corps de la requête ; renvoie le patch ou un message d'erreur. */
function parsePatch(body: Record<string, unknown>): EntryPatch | string {
  const patch: EntryPatch = {};
  if ("status" in body) {
    if (!isLibraryStatus(body.status)) return "Statut invalide.";
    patch.status = body.status;
  }
  if ("isFavorite" in body) {
    if (typeof body.isFavorite !== "boolean") return "Favori invalide.";
    patch.isFavorite = body.isFavorite;
  }
  if ("rating" in body) {
    const r = body.rating;
    if (r !== null && !(typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 10)) return "Note invalide (1 à 10).";
    patch.rating = r as number | null;
  }
  if ("review" in body) {
    const r = body.review;
    if (r !== null && !(typeof r === "string" && r.length <= 20000)) return "Critique invalide.";
    patch.review = typeof r === "string" && r.trim() === "" ? null : (r as string | null);
  }
  if ("startedAt" in body) {
    if (!isDate(body.startedAt)) return "Date de début invalide.";
    patch.startedAt = body.startedAt as string | null;
  }
  if ("completedAt" in body) {
    if (!isDate(body.completedAt)) return "Date de fin invalide.";
    patch.completedAt = body.completedAt as string | null;
  }
  return patch;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const entryId = Number((await params).entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) return NextResponse.json({ error: "Entrée invalide." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const patch = parsePatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });

  const { env } = getCloudflareContext();
  const updated = await updateEntry(env.DB, entryId, patch);
  if (!updated) return NextResponse.json({ error: "Œuvre absente de ta bibliothèque." }, { status: 404 });
  return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
}
