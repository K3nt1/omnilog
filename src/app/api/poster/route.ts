// GET /api/poster?u=<adresse d'une affiche> : l'affiche servie par Omnilog, pour que l'export du bilan en image
// puisse la dessiner (une image d'un autre site, sans en-tête CORS, rendrait l'image exportée inutilisable).
// Seulement les sites d'affiches des sources d'Omnilog.
import { NextResponse, type NextRequest } from "next/server";

const HOSTS = new Set(["image.tmdb.org", "images.igdb.com", "cdn.myanimelist.net", "uploads.mangadex.org", "comicvine.gamespot.com", "s4.anilist.co"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return NextResponse.json({ error: "Adresse invalide." }, { status: 400 });
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return NextResponse.json({ error: "Site non autorisé." }, { status: 400 });
  const res = await fetch(url, { headers: { Accept: "image/*" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Affiche indisponible." }, { status: 502 });
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "Affiche trop lourde." }, { status: 502 });
  return new NextResponse(res.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" },
  });
}
