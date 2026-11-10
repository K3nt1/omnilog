// Comic Vine : comics. Doc : https://comicvine.gamespot.com/api/documentation
// Une série (« volume » chez Comic Vine) = une œuvre ; ses numéros (« issues ») se suivent comme des épisodes.
// Limites : 200 requêtes par heure et par ressource, User-Agent obligatoire, usage non commercial avec lien vers Comic Vine.
import { fetchJson, SourceError } from "./http";
import { resultKey, yearOf, type MediaDetails, type SearchResult } from "../types";

const API = "https://comicvine.gamespot.com/api";
const USER_AGENT = "Omnilog/0.8 (+https://omnilog.kantinus.workers.dev)";
/** Une série dont le dernier numéro date de moins de 4 mois (ou annoncé) est considérée en cours de publication. */
const ONGOING_DAYS = 120;
/** Numéros chargés au plus pour une série (5 pages de 100). */
export const MAX_ISSUES = 500;

interface CvImage {
  medium_url?: string;
  small_url?: string;
  super_url?: string;
  screen_large_url?: string;
}

export interface CvVolume {
  id: number;
  name: string;
  start_year?: string | null;
  count_of_issues?: number;
  publisher?: { name: string } | null;
  image?: CvImage | null;
  deck?: string | null;
  description?: string | null;
  site_detail_url?: string;
  first_issue?: { issue_number?: string } | null;
  last_issue?: { id?: number; issue_number?: string } | null;
}

export interface CvIssue {
  id: number;
  issue_number: string;
  name?: string | null;
  cover_date?: string | null;
  store_date?: string | null;
  image?: CvImage | null;
  site_detail_url?: string;
}

interface CvResponse<T> {
  status_code: number;
  error: string;
  number_of_total_results?: number;
  results: T;
}

/** Appel à l'API (clé, format JSON, User-Agent) avec les erreurs de Comic Vine traduites. */
async function cv<T>(key: string | undefined, path: string, params: Record<string, string>): Promise<CvResponse<T>> {
  if (!key) throw new SourceError("Comic Vine", "Comic Vine : clé d'API absente (COMICVINE_API_KEY)");
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let data: CvResponse<T>;
  try {
    data = await fetchJson<CvResponse<T>>("Comic Vine", url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  } catch (error) {
    // Comic Vine répond 420 / 429 quand on dépasse la limite horaire.
    if (error instanceof SourceError && (error.status === 420 || error.status === 429)) {
      throw new SourceError("Comic Vine", "Comic Vine : limite de requêtes atteinte, réessaie dans un moment", error.status);
    }
    throw error;
  }
  if (data.status_code === 100) throw new SourceError("Comic Vine", "Comic Vine : clé d'API refusée", 401);
  if (data.status_code === 101) throw new SourceError("Comic Vine", "Comic Vine : série introuvable", 404);
  if (data.status_code === 107) throw new SourceError("Comic Vine", "Comic Vine : limite de requêtes atteinte, réessaie dans un moment", 429);
  if (data.status_code !== 1) throw new SourceError("Comic Vine", `Comic Vine : ${data.error || "erreur"}`);
  return data;
}

/** Texte brut à partir du HTML de Comic Vine (descriptions). */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style|table|figure)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
  return text || null;
}

/** Résumé court (« deck ») sinon début de la description, sans HTML. */
export function overviewOf(volume: CvVolume): string | null {
  const deck = stripHtml(volume.deck);
  if (deck) return deck;
  const text = stripHtml(volume.description);
  if (!text) return null;
  return text.length > 1500 ? `${text.slice(0, 1500).replace(/\s+\S*$/, "")}…` : text;
}

/** « 42 » → 42, « 1.5 » → 1.5 ; null pour « Annual 1 », « ½ »… */
export function issueNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const posterOf = (image: CvImage | null | undefined) => image?.medium_url ?? image?.small_url ?? null;

const publisherLine = (volume: CvVolume) =>
  [volume.publisher?.name, volume.count_of_issues ? `${volume.count_of_issues} n°` : null].filter(Boolean).join(" · ") || null;

/** Recherche plus courte : pas envoyée à Comic Vine (trop de résultats, et ça ménage la limite horaire). */
export const COMICVINE_MIN_QUERY_LENGTH = 3;

// Recherches récentes gardées en mémoire tant que le Worker reste actif : la page de recherche relance souvent
// la même requête (retour sur la page, changement de filtre), et Comic Vine limite à 200 requêtes par heure.
const searchCache = new Map<string, { at: number; results: SearchResult[] }>();
const SEARCH_CACHE_MS = 10 * 60_000;

export async function searchComicVine(key: string | undefined, query: string): Promise<SearchResult[]> {
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.results.map((r) => ({ ...r }));
  const results = await searchVolumes(key, query);
  searchCache.set(cacheKey, { at: Date.now(), results });
  if (searchCache.size > 50) searchCache.delete(searchCache.keys().next().value!);
  return results.map((r) => ({ ...r }));
}

async function searchVolumes(key: string | undefined, query: string): Promise<SearchResult[]> {
  const data = await cv<CvVolume[]>(key, "search/", {
    resources: "volume",
    query,
    limit: "20",
    field_list: "id,name,start_year,publisher,image,count_of_issues",
  });
  return data.results.map((volume) => {
    const externalId = String(volume.id);
    return {
      key: resultKey("comic", "comicvine", externalId),
      type: "comic",
      source: "comicvine",
      externalId,
      title: volume.name,
      // Beaucoup de séries portent le même nom (« Batman ») : l'éditeur et le nombre de numéros les distinguent.
      originalTitle: publisherLine(volume),
      year: yearOf(volume.start_year),
      posterUrl: posterOf(volume.image),
      libraryStatus: null,
      genres: [],
    };
  });
}

/** Fiche de la série et son numéro le plus récent (pour savoir si elle est encore publiée). */
export async function getComicVineVolume(key: string | undefined, id: string): Promise<{ volume: CvVolume; latest: CvIssue | null }> {
  if (!/^\d{1,12}$/.test(id)) throw new SourceError("Comic Vine", "Comic Vine : série introuvable", 404);
  const [volume, latest] = await Promise.all([
    cv<CvVolume>(key, `volume/4050-${id}/`, {
      field_list: "id,name,start_year,publisher,image,count_of_issues,deck,description,site_detail_url,first_issue,last_issue",
    }).then((d) => d.results),
    cv<CvIssue[]>(key, "issues/", {
      filter: `volume:${id}`,
      sort: "cover_date:desc",
      limit: "1",
      field_list: "id,issue_number,cover_date,store_date",
    })
      .then((d) => d.results[0] ?? null)
      .catch(() => null), // facultatif : sans lui, la série est simplement considérée comme terminée
  ]);
  // Une série inexistante renvoie parfois un tableau vide au lieu d'une erreur.
  if (!volume || Array.isArray(volume) || !volume.id) throw new SourceError("Comic Vine", "Comic Vine : série introuvable", 404);
  return { volume, latest };
}

/** Date de sortie d'un numéro : en librairie si connue, sinon date de couverture. */
export const issueDate = (issue: Pick<CvIssue, "store_date" | "cover_date">) => issue.store_date || issue.cover_date || null;

export function isOngoing(latest: CvIssue | null, now = Date.now()): boolean {
  const date = latest ? issueDate(latest) : null;
  if (!date) return false;
  const time = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) && time >= now - ONGOING_DAYS * 86_400_000;
}

/** Dernier numéro (le plus grand) : celui qui termine la série une fois lu. */
export function lastIssueNumber(volume: CvVolume, latest: CvIssue | null): number | null {
  const candidates = [issueNumber(volume.last_issue?.issue_number), issueNumber(latest?.issue_number)].filter(
    (n): n is number => n !== null,
  );
  if (candidates.length > 0) return Math.max(...candidates);
  return volume.count_of_issues || null;
}

export async function getComicVineDetails(key: string | undefined, id: string): Promise<MediaDetails> {
  const { volume, latest } = await getComicVineVolume(key, id);
  const startYear = yearOf(volume.start_year);
  return {
    type: "comic",
    source: "comicvine",
    externalId: String(volume.id),
    title: volume.name,
    originalTitle: null,
    overview: overviewOf(volume),
    posterUrl: posterOf(volume.image),
    backdropUrl: null,
    releaseDate: startYear ? `${startYear}-01-01` : null,
    runtimeMinutes: null,
    totalEpisodes: null,
    totalChapters: lastIssueNumber(volume, latest),
    totalVolumes: null,
    isOngoing: isOngoing(latest),
    seasons: [],
    extra: {
      publisher: volume.publisher?.name ?? null,
      issueCount: volume.count_of_issues ?? null,
      url: volume.site_detail_url ?? null,
    },
  };
}

/**
 * Tous les numéros d'une série (jusqu'à MAX_ISSUES), triés par numéro puis par date.
 * Les numéros non numériques (« Annual 1 ») viennent à la fin.
 */
export async function getComicVineIssues(key: string | undefined, id: string, count: number | null): Promise<CvIssue[]> {
  if (!/^\d{1,12}$/.test(id)) throw new SourceError("Comic Vine", "Comic Vine : série introuvable", 404);
  const params = (offset: number) => ({
    filter: `volume:${id}`,
    sort: "cover_date:asc",
    limit: "100",
    offset: String(offset),
    field_list: "id,issue_number,name,cover_date,store_date,image,site_detail_url",
  });
  const first = await cv<CvIssue[]>(key, "issues/", params(0));
  const total = Math.min(first.number_of_total_results ?? count ?? 0, MAX_ISSUES);
  const offsets: number[] = [];
  for (let offset = 100; offset < total; offset += 100) offsets.push(offset);
  const rest = await Promise.all(offsets.map((o) => cv<CvIssue[]>(key, "issues/", params(o)).then((d) => d.results)));
  const issues = [...first.results, ...rest.flat()];
  return issues.sort((a, b) => {
    const na = issueNumber(a.issue_number);
    const nb = issueNumber(b.issue_number);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na === null && nb !== null) return 1;
    if (na !== null && nb === null) return -1;
    return (issueDate(a) ?? "").localeCompare(issueDate(b) ?? "");
  });
}

/** Couvertures des premiers numéros, pour choisir l'affiche d'une série. */
export async function comicCovers(key: string | undefined, id: string): Promise<string[]> {
  if (!/^\d{1,12}$/.test(id)) return [];
  const data = await cv<CvIssue[]>(key, "issues/", {
    filter: `volume:${id}`,
    sort: "cover_date:asc",
    limit: "30",
    field_list: "id,image",
  });
  return [...new Set(data.results.map((i) => posterOf(i.image)).filter((u): u is string => !!u))];
}
