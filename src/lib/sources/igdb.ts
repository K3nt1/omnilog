// IGDB : jeux vidéo. Doc : https://api-docs.igdb.com
// Authentification via Twitch : Client ID + Secret -> jeton d'accès (~60 jours).
import { fetchJson, SourceError } from "./http";
import { resultKey, yearOf, type MediaDetails, type SearchResult } from "../types";

const IMG = "https://images.igdb.com/igdb/image/upload";

interface IgdbCredentials {
  IGDB_CLIENT_ID: string;
  IGDB_CLIENT_SECRET: string;
}

// Jeton gardé en mémoire tant que le Worker reste actif ; redemandé sinon.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(env: IgdbCredentials): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", env.IGDB_CLIENT_ID);
  url.searchParams.set("client_secret", env.IGDB_CLIENT_SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const data = await fetchJson<{ access_token: string; expires_in: number }>("IGDB", url, { method: "POST" });
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function igdb<T>(env: IgdbCredentials, endpoint: string, body: string, retry = true): Promise<T> {
  const token = await getToken(env);
  try {
    return await fetchJson<T>("IGDB", `https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": env.IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
        Accept: "application/json",
      },
      body,
    });
  } catch (error) {
    // Jeton expiré ou révoqué : on en redemande un, une seule fois.
    if (retry && error instanceof SourceError && error.status === 401) {
      cachedToken = null;
      return igdb<T>(env, endpoint, body, false);
    }
    throw error;
  }
}

/** Échappe la saisie pour la syntaxe de requête d'IGDB (Apicalypse). */
const escapeQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const unixToDate = (seconds: number | undefined) =>
  seconds === undefined ? null : new Date(seconds * 1000).toISOString().slice(0, 10);

interface IgdbImage {
  image_id: string;
}

interface IgdbSearchGame {
  id: number;
  name: string;
  cover?: IgdbImage;
  first_release_date?: number;
}

export async function searchIgdb(env: IgdbCredentials, query: string): Promise<SearchResult[]> {
  const games = await igdb<IgdbSearchGame[]>(
    env,
    "games",
    `search "${escapeQuery(query)}"; fields name, cover.image_id, first_release_date; where version_parent = null; limit 12;`,
  );
  return games.map((game) => {
    const externalId = String(game.id);
    return {
      key: resultKey("game", "igdb", externalId),
      type: "game",
      source: "igdb",
      externalId,
      title: game.name,
      originalTitle: null,
      year: yearOf(unixToDate(game.first_release_date)),
      posterUrl: game.cover ? `${IMG}/t_cover_big/${game.cover.image_id}.jpg` : null,
      libraryStatus: null,
    };
  });
}

interface IgdbGame extends IgdbSearchGame {
  slug: string;
  summary?: string;
  artworks?: IgdbImage[];
  screenshots?: IgdbImage[];
  genres?: { name: string }[];
  platforms?: { name: string; abbreviation?: string }[];
}

export async function getIgdbDetails(env: IgdbCredentials, id: string): Promise<MediaDetails> {
  const [game] = await igdb<IgdbGame[]>(
    env,
    "games",
    `fields name, slug, summary, cover.image_id, artworks.image_id, screenshots.image_id, first_release_date, genres.name, platforms.name, platforms.abbreviation; where id = ${Number(id)};`,
  );
  if (!game) throw new SourceError("IGDB", "IGDB : jeu introuvable", 404);

  const background = game.artworks?.[0] ?? game.screenshots?.[0];
  return {
    type: "game",
    source: "igdb",
    externalId: String(game.id),
    title: game.name,
    originalTitle: null,
    overview: game.summary ?? null,
    posterUrl: game.cover ? `${IMG}/t_cover_big/${game.cover.image_id}.jpg` : null,
    backdropUrl: background ? `${IMG}/t_1080p/${background.image_id}.jpg` : null,
    releaseDate: unixToDate(game.first_release_date),
    runtimeMinutes: null,
    totalEpisodes: null,
    totalChapters: null,
    totalVolumes: null,
    isOngoing: false,
    seasons: [],
    extra: {
      slug: game.slug, // sert aussi à construire le lien Backloggd
      genres: game.genres?.map((g) => g.name) ?? [],
      platforms: game.platforms?.map((p) => p.abbreviation ?? p.name) ?? [],
    },
  };
}
