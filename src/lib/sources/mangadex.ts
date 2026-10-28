// MangaDex (API publique, sans clé) : tomes → chapitres et date du dernier chapitre paru d'un manga.
// Doc : https://api.mangadex.org/docs/
// MyAnimeList ne relie pas les chapitres aux tomes et ne donne pas les dates de sortie des chapitres.
// Le classement dépend de ce qui est publié sur MangaDex : il peut manquer des tomes sur les gros titres sous licence.
import { fetchJson } from "./http";

const API = "https://api.mangadex.org";
const HEADERS = { "User-Agent": "Omnilog/0.6 (site perso)", Accept: "application/json" };
const RATINGS = ["safe", "suggestive", "erotica"];

function get<T>(path: string, params: [string, string][] = []): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of params) url.searchParams.append(key, value);
  return fetchJson<T>("MangaDex", url, { headers: HEADERS });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lien MangaDex d'une œuvre (gardé dans media.external_links_json) → identifiant. */
export function mangadexIdFromLink(link: string | undefined): string | null {
  const id = link?.match(/\/title\/([0-9a-f-]{36})/)?.[1];
  return id && UUID.test(id) ? id : null;
}

export const mangadexLink = (id: string) => `https://mangadex.org/title/${id}`;

interface MangaList {
  data: { id: string; attributes: { links?: Record<string, string> | null } }[];
}

/**
 * Retrouve le manga MangaDex correspondant à un identifiant MyAnimeList : recherche par titre,
 * puis vérification du lien MAL indiqué par MangaDex (aucune correspondance « au jugé »).
 */
export async function findMangadexId(malId: string, titles: (string | null)[]): Promise<string | null> {
  const tried = new Set<string>();
  for (const title of titles) {
    const t = title?.trim();
    if (!t || tried.has(t.toLowerCase())) continue;
    tried.add(t.toLowerCase());
    const list = await get<MangaList>("/manga", [["title", t], ["limit", "20"], ...RATINGS.map((r): [string, string] => ["contentRating[]", r])]);
    const match = list.data.find((m) => m.attributes.links?.mal === malId);
    if (match) return match.id;
  }
  return null;
}

interface Aggregate {
  volumes: Record<string, { volume: string; chapters: Record<string, { chapter: string; id: string }> }> | unknown[];
}

/** Tomes → numéros de chapitre (« none » = chapitres pas encore reliés à un tome). */
export async function volumeMap(id: string): Promise<Map<string, number[]>> {
  const data = await get<Aggregate>(`/manga/${id}/aggregate`);
  const map = new Map<string, number[]>();
  if (Array.isArray(data.volumes)) return map; // MangaDex renvoie [] quand il n'y a rien
  for (const [key, volume] of Object.entries(data.volumes)) {
    const chapters = Object.values(volume.chapters ?? {})
      .map((c) => Number.parseFloat(c.chapter))
      .filter((n) => Number.isFinite(n));
    map.set(key, chapters);
  }
  return map;
}

/** Dernier chapitre d'un tome, ou null si MangaDex ne le connaît pas. */
export function lastChapterOfVolume(map: Map<string, number[]>, volume: number): number | null {
  const chapters = map.get(String(volume));
  return chapters && chapters.length > 0 ? Math.max(...chapters) : null;
}

interface ChapterList {
  data: { attributes: { chapter: string | null; publishAt?: string; readableAt?: string } }[];
}

/** Dernier chapitre paru (numéro le plus élevé) et sa première date de publication sur MangaDex. */
export async function latestChapter(id: string): Promise<{ chapter: number; at: string | null } | null> {
  const map = await volumeMap(id);
  const all = [...map.values()].flat();
  if (all.length === 0) return null;
  const chapter = Math.max(...all);
  const list = await get<ChapterList>("/chapter", [
    ["manga", id],
    ["chapter", String(chapter)],
    ["order[publishAt]", "asc"],
    ["limit", "1"],
    ...RATINGS.map((r): [string, string] => ["contentRating[]", r]),
  ]);
  const first = list.data[0]?.attributes;
  return { chapter, at: first?.publishAt ?? first?.readableAt ?? null };
}
