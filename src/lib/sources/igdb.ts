// IGDB : jeux vidéo. Doc : https://api-docs.igdb.com
// Authentification via Twitch : Client ID + Secret -> jeton d'accès (~60 jours).
import { genreLabels } from "../genres";
import { fetchJson, SourceError } from "./http";
import type { ReleasePrecision } from "../release-shared";
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
  genres?: { name: string }[];
}

export async function searchIgdb(env: IgdbCredentials, query: string): Promise<SearchResult[]> {
  const games = await igdb<IgdbSearchGame[]>(
    env,
    "games",
    `search "${escapeQuery(query)}"; fields name, cover.image_id, first_release_date, genres.name; where version_parent = null; limit 12;`,
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
      genres: [...new Set((game.genres ?? []).flatMap((g) => genreLabels(g.name)))],
    };
  });
}

/** Date de sortie IGDB : son format dit sa précision (jour, mois, trimestre, année, à déterminer). */
interface IgdbReleaseDate {
  date?: number;
  date_format?: number | { id: number };
  category?: number;
}

/** Précision de la première sortie : 0 = jour, 1 = mois, 2 = année, 3 à 6 = trimestre, 7 = à déterminer. */
export function releasePrecision(dates: IgdbReleaseDate[] | undefined, first: number | undefined): ReleasePrecision {
  const match = dates?.find((d) => d.date === first) ?? (first === undefined ? dates?.[0] : undefined);
  if (!match) return "day";
  const format = typeof match.date_format === "object" ? match.date_format?.id : (match.date_format ?? match.category);
  if (format === 1) return "month";
  if (format === 2) return "year";
  if (format !== undefined && format >= 3 && format <= 6) return "quarter";
  if (format === 7) return "tbd";
  return "day";
}

interface IgdbGame extends IgdbSearchGame {
  slug: string;
  release_dates?: IgdbReleaseDate[];
  summary?: string;
  artworks?: IgdbImage[];
  screenshots?: IgdbImage[];
  genres?: { name: string }[];
  platforms?: { name: string; abbreviation?: string }[];
}

/** Durées de jeu IGDB, en secondes (rapide, normal, 100 %). */
interface IgdbTimeToBeat {
  hastily?: number;
  normally?: number;
  completely?: number;
}

const toMinutes = (seconds: number | undefined) => (seconds && seconds > 0 ? Math.round(seconds / 60) : null);

/** Champs d'un jeu pour sa fiche (sans la durée de vie, qui vient d'un autre point d'accès). */
const GAME_FIELDS =
  "name, slug, summary, cover.image_id, artworks.image_id, screenshots.image_id, first_release_date, release_dates.date, release_dates.date_format, release_dates.category, genres.name, platforms.name, platforms.abbreviation";

type TimeToBeat = { hastily: number | null; normally: number | null; completely: number | null };

/** Jeu IGDB → fiche Omnilog. */
function gameDetails(game: IgdbGame, timeToBeat: TimeToBeat): MediaDetails {
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
    // « Durée de vie » d'un jeu : temps normal pour le finir (sinon rapide, sinon 100 %).
    runtimeMinutes: timeToBeat.normally ?? timeToBeat.hastily ?? timeToBeat.completely,
    totalEpisodes: null,
    totalChapters: null,
    totalVolumes: null,
    isOngoing: false,
    seasons: [],
    extra: {
      slug: game.slug, // sert aussi à construire le lien Backloggd
      genres: game.genres?.map((g) => g.name) ?? [],
      platforms: game.platforms?.map((p) => p.abbreviation ?? p.name) ?? [],
      timeToBeat, // minutes
      // Précision de la date de sortie (une date « 2027 » est rangée au 31 décembre par IGDB).
      releasePrecision: releasePrecision(game.release_dates, game.first_release_date),
    },
  };
}

export async function getIgdbDetails(env: IgdbCredentials, id: string): Promise<MediaDetails> {
  const [[game], times] = await Promise.all([
    igdb<IgdbGame[]>(env, "games", `fields ${GAME_FIELDS}; where id = ${Number(id)};`),
    // Facultatif : beaucoup de jeux n'ont pas encore de durée, et une erreur ici ne doit pas bloquer l'ajout.
    igdb<IgdbTimeToBeat[]>(env, "game_time_to_beats", `fields hastily, normally, completely; where game_id = ${Number(id)};`)
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
  ]);
  if (!game) throw new SourceError("IGDB", "IGDB : jeu introuvable", 404);
  return gameDetails(game, {
    hastily: toMinutes(times?.hastily),
    normally: toMinutes(times?.normally),
    completely: toMinutes(times?.completely),
  });
}

/** Un slug IGDB / Backloggd (« over-the-hill », « hades--1 ») : lettres, chiffres et tirets. */
export const isGameSlug = (slug: string) => /^[a-z0-9][a-z0-9-]{0,150}$/.test(slug);

/**
 * Fiches de plusieurs jeux en une requête (import Backloggd : même slug qu'IGDB), par slug et, à défaut,
 * par identifiant. Sans durée de vie (elle arrive au premier rafraîchissement de la fiche).
 */
export async function getIgdbGamesBySlugs(
  env: IgdbCredentials,
  slugs: string[],
  ids: number[] = [],
): Promise<{ bySlug: Map<string, MediaDetails>; byId: Map<string, MediaDetails> }> {
  const valid = [...new Set(slugs.filter(isGameSlug))];
  const numbers = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const bySlug = new Map<string, MediaDetails>();
  const byId = new Map<string, MediaDetails>();
  if (valid.length === 0 && numbers.length === 0) return { bySlug, byId };
  const where = [
    valid.length > 0 ? `slug = (${valid.map((s) => `"${s}"`).join(",")})` : null,
    numbers.length > 0 ? `id = (${numbers.join(",")})` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const games = await igdb<IgdbGame[]>(env, "games", `fields ${GAME_FIELDS}; where ${where}; limit 500;`);
  const none = { hastily: null, normally: null, completely: null };
  for (const game of games) {
    const details = gameDetails(game, none);
    bySlug.set(game.slug, details);
    byId.set(String(game.id), details);
  }
  return { bySlug, byId };
}

/** Titre comparable : sans accents, ponctuation ni majuscules (« Kahoot! » = « kahoot »). */
export const normalizeGameTitle = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

interface IgdbNamedGame extends IgdbGame {
  alternative_names?: { name: string }[];
}

/**
 * Deuxième chance pour les jeux introuvables par slug (slug changé chez IGDB depuis l'ajout sur Backloggd) :
 * recherche par titre, versions et DLC compris, 10 titres par requête (multiquery IGDB).
 * Seul un titre identique (nom ou nom alternatif, sans accents ni ponctuation) est retenu : jamais de jeu « approchant ».
 */
export async function findIgdbGamesByTitles(env: IgdbCredentials, titles: string[]): Promise<Map<string, MediaDetails>> {
  const found = new Map<string, MediaDetails>();
  const unique = [...new Set(titles.map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 200))];
  const none = { hastily: null, normally: null, completely: null };
  for (let start = 0; start < unique.length; start += 10) {
    const chunk = unique.slice(start, start + 10);
    const body = chunk
      .map((title, i) => `query games "${i}" { fields ${GAME_FIELDS}, alternative_names.name; search "${escapeQuery(title)}"; limit 10; };`)
      .join("\n");
    const answers = await igdb<{ name: string; result: IgdbNamedGame[] }[]>(env, "multiquery", body);
    for (const answer of answers) {
      const title = chunk[Number(answer.name)];
      if (title === undefined) continue;
      const wanted = normalizeGameTitle(title);
      const match = answer.result.find(
        (g) => normalizeGameTitle(g.name) === wanted || (g.alternative_names ?? []).some((a) => normalizeGameTitle(a.name) === wanted),
      );
      if (match) found.set(title, gameDetails(match, none));
    }
  }
  return found;
}

/** Slug d'un lien de jeu Backloggd ou IGDB collé dans la recherche (« backloggd.com/games/hades/ »), sinon null. */
export function gameSlugFromLink(query: string): string | null {
  const slug = query.trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:backloggd\.com|igdb\.com)\/games\/([a-z0-9-]+)\/?(?:[?#].*)?$/i)?.[1];
  return slug && isGameSlug(slug.toLowerCase()) ? slug.toLowerCase() : null;
}

const gameResult = (d: MediaDetails): SearchResult => ({
  key: resultKey("game", "igdb", d.externalId),
  type: "game",
  source: "igdb",
  externalId: d.externalId,
  title: d.title,
  originalTitle: null,
  year: yearOf(d.releaseDate),
  posterUrl: d.posterUrl,
  libraryStatus: null,
  genres: [...new Set(((d.extra.genres as string[] | undefined) ?? []).flatMap((g) => genreLabels(g)))],
});

/**
 * Lien de jeu collé dans la recherche : le jeu exact par son slug ; si IGDB ne le connaît plus sous ce slug,
 * recherche par les mots du slug (versions et DLC compris), pour choisir soi-même.
 */
export async function searchIgdbLink(env: IgdbCredentials, slug: string): Promise<SearchResult[]> {
  const { bySlug } = await getIgdbGamesBySlugs(env, [slug]);
  const exact = bySlug.get(slug);
  if (exact) return [gameResult(exact)];
  const words = slug.replace(/--\d+$/, "").replace(/-+/g, " ").trim();
  if (!words) return [];
  const games = await igdb<IgdbGame[]>(env, "games", `fields ${GAME_FIELDS}; search "${escapeQuery(words)}"; limit 12;`);
  const none = { hastily: null, normally: null, completely: null };
  return games.map((g) => gameResult(gameDetails(g, none)));
}

/** Appel brut à l'API IGDB (fiche média). */
export const igdbQuery = igdb;
export const igdbImage = (imageId: string | undefined, size: string) => (imageId ? `${IMG}/${size}/${imageId}.jpg` : null);
export type { IgdbCredentials };
