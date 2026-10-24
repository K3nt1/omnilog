import { getIgdbFiche } from "./igdb";
import { getMalFiche } from "./mal";
import { getTmdbFiche } from "./tmdb";
import type { MediaType } from "../types";
import type { MediaFiche } from "./types";

export type { MediaFiche } from "./types";

/** Fiche complète, en direct depuis la source de l'œuvre. `region` : pays pour « Où regarder » (ex. « CY »). */
export function getFiche(env: CloudflareEnv, type: MediaType, externalId: string, region: string): Promise<MediaFiche> {
  switch (type) {
    case "movie":
    case "tv":
      return getTmdbFiche(env.TMDB_API_TOKEN, type, externalId, region);
    case "anime":
    case "manga":
      return getMalFiche(env.MAL_CLIENT_ID, type, externalId);
    case "game":
      return getIgdbFiche(env, externalId);
  }
}
