// MyAnimeList (API officielle v2) : animés et mangas.
// Doc : https://myanimelist.net/apiconfig/references/api/v2
// Lecture seule avec le Client ID (en-tête X-MAL-CLIENT-ID), sans compte utilisateur.
import { genreLabels } from "../genres";
import { fetchJson } from "./http";
import { resultKey, yearOf, type MediaDetails, type SearchResult } from "../types";

const API = "https://api.myanimelist.net/v2";

/** MAL refuse les recherches de moins de 3 caractères. */
export const MAL_MIN_QUERY_LENGTH = 3;

function mal<T>(clientId: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchJson<T>("MyAnimeList", url, {
    headers: { "X-MAL-CLIENT-ID": clientId, Accept: "application/json" },
  });
}

interface MalPicture {
  medium?: string;
  large?: string;
}

interface MalNode {
  id: number;
  title: string;
  main_picture?: MalPicture;
  alternative_titles?: { en?: string; ja?: string };
  start_date?: string;
  genres?: { name: string }[];
}

export async function searchMal(clientId: string, kind: "anime" | "manga", query: string): Promise<SearchResult[]> {
  const data = await mal<{ data: { node: MalNode }[] }>(clientId, `/${kind}`, {
    q: query,
    limit: "10",
    fields: "alternative_titles,start_date,genres",
  });
  return data.data.map(({ node }) => {
    const externalId = String(node.id);
    const english = node.alternative_titles?.en;
    return {
      key: resultKey(kind, "mal", externalId),
      type: kind,
      source: "mal",
      externalId,
      title: node.title,
      originalTitle: english && english !== node.title ? english : null,
      year: yearOf(node.start_date),
      posterUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
      libraryStatus: null,
      genres: [...new Set((node.genres ?? []).flatMap((g) => genreLabels(g.name)))],
      matchTitles: [node.title, english, node.alternative_titles?.ja].filter((t): t is string => !!t),
    };
  });
}

interface MalDetails extends MalNode {
  synopsis?: string;
  status?: string;
  genres?: { name: string }[];
  num_episodes?: number;
  average_episode_duration?: number; // secondes
  num_chapters?: number;
  num_volumes?: number;
}

/** MAL renvoie 0 quand le total est inconnu (œuvre en cours). */
const positiveOrNull = (value: number | undefined) => (value && value > 0 ? value : null);

export async function getMalDetails(clientId: string, kind: "anime" | "manga", id: string): Promise<MediaDetails> {
  const fields =
    kind === "anime"
      ? "alternative_titles,start_date,synopsis,status,genres,num_episodes,average_episode_duration"
      : "alternative_titles,start_date,synopsis,status,genres,num_chapters,num_volumes";
  const d = await mal<MalDetails>(clientId, `/${kind}/${Number(id)}`, { fields });
  const english = d.alternative_titles?.en;

  return {
    type: kind,
    source: "mal",
    externalId: String(d.id),
    title: d.title,
    originalTitle: english && english !== d.title ? english : null,
    overview: d.synopsis ?? null,
    posterUrl: d.main_picture?.large ?? d.main_picture?.medium ?? null,
    backdropUrl: null,
    releaseDate: d.start_date ?? null,
    runtimeMinutes: d.average_episode_duration ? Math.round(d.average_episode_duration / 60) : null,
    totalEpisodes: positiveOrNull(d.num_episodes),
    totalChapters: positiveOrNull(d.num_chapters),
    totalVolumes: positiveOrNull(d.num_volumes),
    isOngoing: d.status === "currently_airing" || d.status === "currently_publishing",
    seasons: [],
    extra: { genres: d.genres?.map((g) => g.name) ?? [], status: d.status ?? null },
  };
}

/** Appel brut à l'API MyAnimeList (fiche média). */
export const malGet = mal;
