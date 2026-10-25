// Lecture et vérification du corps des requêtes du journal (partagée par les routes).
import type { JournalPatch } from "./journal";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Renvoie le patch, ou un message d'erreur. */
export function parseJournalPatch(body: Record<string, unknown>): JournalPatch | string {
  const patch: JournalPatch = {};
  if ("date" in body) {
    // null ou "" : sans date (comme sur Letterboxd).
    if (body.date === null || body.date === "") patch.date = null;
    else if (typeof body.date !== "string" || !DATE.test(body.date)) return "Date invalide.";
    else patch.date = body.date;
  }
  if ("rating" in body) {
    const r = body.rating;
    if (r !== null && !(typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 10)) return "Note invalide (1 à 10).";
    patch.rating = r as number | null;
  }
  if ("review" in body) {
    if (body.review !== null && !(typeof body.review === "string" && body.review.length <= 20000)) return "Critique invalide.";
    patch.review = body.review as string | null;
  }
  if ("tags" in body) {
    const tags = body.tags;
    if (!Array.isArray(tags) || tags.length > 30 || !tags.every((t) => typeof t === "string" && t.trim() && t.length <= 50)) {
      return "Tags invalides.";
    }
    patch.tags = [...new Set(tags.map((t: string) => t.trim()))];
  }
  return patch;
}
