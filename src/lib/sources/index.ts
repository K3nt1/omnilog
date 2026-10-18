// Point d'entrée unique : recherche dans toutes les sources en parallèle,
// et récupération de la fiche complète d'une œuvre.
import { SourceError } from "./http";
import { getIgdbDetails, searchIgdb } from "./igdb";
import { getMalDetails, MAL_MIN_QUERY_LENGTH, searchMal } from "./mal";
import { getTmdbDetails, searchTmdb } from "./tmdb";
import type { MediaDetails, MediaSource, MediaType, SearchResponse, SearchResult } from "../types";

export async function searchAll(env: CloudflareEnv, query: string, types: Set<MediaType>): Promise<SearchResponse> {
  const tasks: { source: MediaSource; run: () => Promise<SearchResult[]> }[] = [];

  if (types.has("movie") || types.has("tv")) {
    tasks.push({ source: "tmdb", run: () => searchTmdb(env.TMDB_API_TOKEN, query, types) });
  }
  if (types.has("game")) {
    tasks.push({ source: "igdb", run: () => searchIgdb(env, query) });
  }
  if (query.length >= MAL_MIN_QUERY_LENGTH) {
    if (types.has("anime")) tasks.push({ source: "mal", run: () => searchMal(env.MAL_CLIENT_ID, "anime", query) });
    if (types.has("manga")) tasks.push({ source: "mal", run: () => searchMal(env.MAL_CLIENT_ID, "manga", query) });
  }

  // allSettled : si une source tombe en panne, les autres résultats s'affichent quand même.
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const results: SearchResult[] = [];
  const errors: SearchResponse["errors"] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      const reason = outcome.reason;
      console.error(`Recherche ${tasks[index].source} en échec`, reason);
      errors.push({
        source: tasks[index].source,
        message: reason instanceof SourceError ? reason.message : `${tasks[index].source} : erreur inattendue`,
      });
    }
  });

  return { results, errors };
}

export function getDetails(
  env: CloudflareEnv,
  type: MediaType,
  externalId: string,
): Promise<MediaDetails> {
  switch (type) {
    case "movie":
    case "tv":
      return getTmdbDetails(env.TMDB_API_TOKEN, type, externalId);
    case "game":
      return getIgdbDetails(env, externalId);
    case "anime":
    case "manga":
      return getMalDetails(env.MAL_CLIENT_ID, type, externalId);
  }
}
