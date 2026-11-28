// POST /api/draw  { "type": "movie" }
// Tire au sort une œuvre de la watchlist / du backlog du type ; elle devient le focus.
// Rappeler la route = « Relancer » : l'œuvre tirée avant (pas commencée) retourne dans la watchlist / le backlog.
// Réponse : { entryId, picked: { title, posterUrl }, others: [...] } (affiches pour l'animation du tirage).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { drawRandom } from "@/lib/progress";
import { isOwnedKey, ownedKeyLabel } from "@/lib/ownership-shared";
import { isMediaType } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: { type?: unknown; owned?: unknown };
  try {
    body = ((await request.json()) ?? {}) as { type?: unknown; owned?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (!isMediaType(body.type)) return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  const owned = typeof body.owned === "string" && isOwnedKey(body.owned) ? body.owned : null;
  const { env } = getCloudflareContext();
  const entryId = await drawRandom(env.DB, body.type, owned);
  if (entryId === null) {
    const where = owned ? ` (possédé sur ${ownedKeyLabel(owned)})` : "";
    return NextResponse.json({ error: `Rien à tirer au sort${where} : la liste est vide.` }, { status: 404 });
  }
  // Pour l'animation : l'œuvre tirée et quelques autres affiches de la liste, qui défilent avant elle.
  const [pickedRows, otherRows] = await env.DB.batch<{ title: string; poster_url: string | null }>([
    env.DB.prepare(
      `SELECT m.title, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url
       FROM library_entries l JOIN media m ON m.id = l.media_id WHERE l.id = ?`,
    ).bind(entryId),
    env.DB.prepare(
      `SELECT m.title, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url
       FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.media_type = ? AND l.status = 'planned' AND l.substatus IS NULL AND l.id <> ? AND COALESCE(l.custom_poster_url, m.poster_url) IS NOT NULL
       ORDER BY random() LIMIT 12`,
    ).bind(body.type, entryId),
  ]);
  const picked = pickedRows.results[0];
  return NextResponse.json(
    {
      entryId,
      picked: picked ? { title: picked.title, posterUrl: picked.poster_url } : null,
      others: otherRows.results.map((r) => ({ title: r.title, posterUrl: r.poster_url })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
