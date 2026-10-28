// Après avoir terminé une œuvre en focus : le focus passe à la suite.
// - film d'une saga (collection TMDB) : le film suivant, par date de sortie, pas encore vu ;
// - anime : la saison suivante (relation « suite » chez MyAnimeList), pas encore vue.
// Séries : rien à faire, le focus avance déjà d'épisode en épisode et de saison en saison.
// Mangas et jeux : pas de passage automatique.
import { addToLibrary, CURRENT_USER_ID } from "./library";
import { setFocus } from "./progress";
import { getDetails } from "./sources";
import { malGet } from "./sources/mal";
import { tmdbGet } from "./sources/tmdb";
import { SOURCE_FOR_TYPE, type LibraryStatus, type MediaType } from "./types";

const today = () => new Date().toISOString().slice(0, 10);

/** Statut dans la bibliothèque de quelques œuvres d'un type (identifiant de la source → statut). */
async function statusesOf(db: D1Database, type: MediaType, ids: string[]): Promise<Map<string, LibraryStatus>> {
  const map = new Map<string, LibraryStatus>();
  if (ids.length === 0) return map;
  const { results } = await db
    .prepare(
      `SELECT m.external_id, l.status FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.type = ? AND m.source = ? AND m.external_id IN (${ids.map(() => "?").join(", ")})`,
    )
    .bind(CURRENT_USER_ID, type, SOURCE_FOR_TYPE[type], ...ids.slice(0, 90))
    .all<{ external_id: string; status: LibraryStatus }>();
  for (const r of results) map.set(r.external_id, r.status);
  return map;
}

/** Films de la même saga après celui-ci, dans l'ordre de sortie (sortis uniquement). */
async function nextMovies(env: CloudflareEnv, id: string): Promise<string[]> {
  const movie = await tmdbGet<{ belongs_to_collection: { id: number } | null; release_date?: string }>(
    env.TMDB_API_TOKEN,
    `/movie/${Number(id)}`,
  );
  if (!movie.belongs_to_collection) return [];
  const collection = await tmdbGet<{ parts: { id: number; release_date?: string }[] }>(
    env.TMDB_API_TOKEN,
    `/collection/${movie.belongs_to_collection.id}`,
  );
  const parts = collection.parts
    .filter((p) => p.release_date && p.release_date <= today())
    .sort((a, b) => a.release_date!.localeCompare(b.release_date!));
  const index = parts.findIndex((p) => String(p.id) === id);
  return (index >= 0 ? parts.slice(index + 1) : []).map((p) => String(p.id));
}

/** Saisons suivantes d'un anime (chaîne des « suites » MAL), au plus 6 étapes. */
async function nextAnimes(env: CloudflareEnv, id: string): Promise<string[]> {
  const chain: string[] = [];
  let current = id;
  for (let step = 0; step < 6; step++) {
    const data = await malGet<{ related_anime?: { node: { id: number }; relation_type: string }[] }>(
      env.MAL_CLIENT_ID,
      `/anime/${Number(current)}`,
      { fields: "related_anime" },
    );
    const sequel = data.related_anime?.find((r) => r.relation_type === "sequel");
    if (!sequel || chain.includes(String(sequel.node.id))) break;
    chain.push(String(sequel.node.id));
    current = String(sequel.node.id);
  }
  return chain;
}

/**
 * Met en focus la suite d'une œuvre qu'on vient de terminer (en l'ajoutant à la watchlist si besoin).
 * Renvoie le titre de la suite, ou null s'il n'y en a pas. Une erreur de la source n'empêche rien.
 */
export async function focusNextInSeries(env: CloudflareEnv, type: MediaType, externalId: string): Promise<string | null> {
  if (type !== "movie" && type !== "anime") return null;
  try {
    // Toute la suite de la saga / de l'anime, puis la première œuvre pas encore vue.
    const candidates = type === "movie" ? await nextMovies(env, externalId) : await nextAnimes(env, externalId);
    const statuses = await statusesOf(env.DB, type, candidates);
    const next = candidates.find((c) => statuses.get(c) !== "completed");
    if (!next) return null;
    const details = await getDetails(env, type, next);
    const added = await addToLibrary(env.DB, details, "planned"); // déjà présente : rien ne change
    await setFocus(env.DB, added.entryId, true);
    return details.title;
  } catch (error) {
    console.error("Passage à la suite impossible", type, externalId, error);
    return null;
  }
}
