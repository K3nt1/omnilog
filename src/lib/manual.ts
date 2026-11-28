// Œuvres ajoutées à la main : absentes de leur source (jeu retiré d'IGDB, film inconnu de TMDB…).
// Elles vivent dans le catalogue comme les autres (source « manual », identifiant « m… ») : statut, progression,
// journal, notes, calendrier et bilan marchent pareil. Aucune tâche automatique ne les relit chez une source.
import { addToLibrary, CURRENT_USER_ID } from "./library";
import { mediaSearchText } from "./search-text";
import { isLibraryStatus, isManualId, isMediaType, type LibraryStatus, type MediaDetails, type MediaType, type SeasonInfo } from "./types";

export interface ManualInput {
  type: MediaType;
  title: string;
  /** « 1996 » ou « 1996-09-26 ». */
  release: string | null;
  posterUrl: string | null;
  overview: string | null;
  /** Film : durée ; jeu : non utilisé. */
  runtimeMinutes: number | null;
  /** Animé : nombre d'épisodes. */
  totalEpisodes: number | null;
  /** Série : nombre d'épisodes de chaque saison (« 10, 8, 12 »). */
  seasons: number[];
  /** Manga : chapitres ; comic : numéros. */
  totalChapters: number | null;
  /** Manga : tomes. */
  totalVolumes: number | null;
  /** Jeu : plateformes de sortie (« PC », « PS1 »…). */
  platforms: string[];
}

const MAX_TITLE = 200;
const MAX_OVERVIEW = 4000;

const intOrNull = (value: unknown, max: number): number | null | "invalid" => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : "invalid";
};

/** Image : adresse https seulement (affichée telle quelle dans les pages). */
export function cleanImageUrl(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 1000) return "invalid";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

/** Vérifie la saisie du formulaire ; renvoie le message d'erreur à afficher, ou la saisie propre. */
export function parseManualInput(body: Record<string, unknown>, type?: MediaType): ManualInput | string {
  const t = type ?? body.type;
  if (!isMediaType(t)) return "Type d'œuvre invalide.";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return "Le titre est obligatoire.";
  if (title.length > MAX_TITLE) return "Titre trop long.";
  let release: string | null = null;
  if (typeof body.release === "string" && body.release.trim()) {
    release = body.release.trim();
    if (!/^\d{4}(-\d{2}-\d{2})?$/.test(release) || Number(release.slice(0, 4)) < 1800 || Number(release.slice(0, 4)) > 2200) {
      return "Date de sortie : une année (1996) ou une date complète.";
    }
    if (release.length === 10 && Number.isNaN(Date.parse(`${release}T00:00:00Z`))) return "Date de sortie invalide.";
  }
  const posterUrl = cleanImageUrl(body.posterUrl);
  if (posterUrl === "invalid") return "L'image doit être une adresse https://…";
  const overview = typeof body.overview === "string" && body.overview.trim() ? body.overview.trim().slice(0, MAX_OVERVIEW) : null;
  const runtime = intOrNull(body.runtimeMinutes, 10_000);
  const episodes = intOrNull(body.totalEpisodes, 100_000);
  const chapters = intOrNull(body.totalChapters, 100_000);
  const volumes = intOrNull(body.totalVolumes, 10_000);
  if (runtime === "invalid" || episodes === "invalid" || chapters === "invalid" || volumes === "invalid") return "Les nombres doivent être des entiers positifs.";
  const seasons = Array.isArray(body.seasons) ? body.seasons.map((n) => Number(n)) : [];
  if (seasons.length > 100 || seasons.some((n) => !Number.isInteger(n) || n < 1 || n > 5000)) return "Saisons : un nombre d'épisodes (au moins 1) par saison.";
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter((p) => p.length > 0 && p.length <= 60))].slice(0, 30)
    : [];
  return {
    type: t,
    title,
    release,
    posterUrl,
    overview,
    runtimeMinutes: t === "movie" ? runtime : null,
    totalEpisodes: t === "anime" ? episodes : t === "tv" && seasons.length > 0 ? seasons.reduce((a, b) => a + b, 0) : null,
    seasons: t === "tv" ? seasons : [],
    totalChapters: t === "manga" || t === "comic" ? chapters : null,
    totalVolumes: t === "manga" ? volumes : null,
    platforms: t === "game" ? platforms : [],
  };
}

/** Identifiant d'une nouvelle œuvre ajoutée à la main : « m » + 12 chiffres au hasard. */
export function newManualId(): string {
  const digits = crypto.getRandomValues(new Uint32Array(2));
  return `m${String(digits[0] % 1_000_000).padStart(6, "0")}${String(digits[1] % 1_000_000).padStart(6, "0")}`;
}

/** Fiche à enregistrer d'après la saisie. */
export function manualDetails(input: ManualInput, externalId: string): MediaDetails {
  const releaseDate = input.release ? (input.release.length === 4 ? `${input.release}-01-01` : input.release) : null;
  const seasons: SeasonInfo[] = input.seasons.map((count, i) => ({ seasonNumber: i + 1, episodeCount: count, name: null, airDate: null }));
  return {
    type: input.type,
    source: "manual",
    externalId,
    title: input.title,
    originalTitle: null,
    overview: input.overview,
    posterUrl: input.posterUrl,
    backdropUrl: null,
    releaseDate,
    runtimeMinutes: input.runtimeMinutes,
    totalEpisodes: input.totalEpisodes,
    totalChapters: input.totalChapters,
    totalVolumes: input.totalVolumes,
    isOngoing: false,
    seasons,
    extra: {
      manual: true,
      // Année seule : le 1er janvier n'est qu'un repère (affichée « 1996 », jamais comme une date précise).
      ...(input.release?.length === 4 ? { releasePrecision: "year" } : {}),
      ...(input.platforms.length > 0 ? { platforms: input.platforms } : {}),
    },
  };
}

/** Crée l'œuvre et l'ajoute à ta bibliothèque avec ce statut. */
export async function createManualWork(
  db: D1Database,
  input: ManualInput,
  status: LibraryStatus,
): Promise<{ type: MediaType; externalId: string; entryId: number }> {
  if (!isLibraryStatus(status)) throw new Error("Statut invalide");
  const externalId = newManualId();
  const added = await addToLibrary(db, manualDetails(input, externalId), status);
  return { type: input.type, externalId, entryId: added.entryId };
}

/**
 * Modifie une œuvre ajoutée à la main (titre, date, image, résumé, nombres, saisons).
 * Seulement si elle est dans ta bibliothèque. Une saison retirée n'efface pas ton journal.
 */
export async function updateManualWork(db: D1Database, externalId: string, input: ManualInput): Promise<boolean> {
  if (!isManualId(externalId)) return false;
  const media = await db
    .prepare(
      `SELECT m.id, m.extra_json FROM media m JOIN library_entries l ON l.media_id = m.id AND l.user_id = ?
       WHERE m.type = ? AND m.source = 'manual' AND m.external_id = ?`,
    )
    .bind(CURRENT_USER_ID, input.type, externalId)
    .first<{ id: number; extra_json: string | null }>();
  if (!media) return false;
  const previous = media.extra_json ? (JSON.parse(media.extra_json) as Record<string, unknown>) : {};
  const details = manualDetails(input, externalId);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE media SET title = ?, overview = ?, poster_url = ?, release_date = ?, runtime_minutes = ?, total_episodes = ?,
                          total_chapters = ?, total_volumes = ?, extra_json = ?, search_text = ?
         WHERE id = ?`,
      )
      .bind(
        details.title,
        details.overview,
        details.posterUrl,
        details.releaseDate,
        details.runtimeMinutes,
        details.totalEpisodes,
        details.totalChapters,
        details.totalVolumes,
        JSON.stringify({ ...previous, ...details.extra, releasePrecision: details.extra.releasePrecision ?? null, platforms: input.platforms }),
        mediaSearchText(details.title, null),
        media.id,
      ),
  ];
  if (input.type === "tv") {
    statements.push(db.prepare("DELETE FROM media_seasons WHERE media_id = ? AND season_number > ?").bind(media.id, input.seasons.length));
    const upsert = db.prepare(
      `INSERT INTO media_seasons (media_id, season_number, episode_count, name, air_date) VALUES (?, ?, ?, NULL, NULL)
       ON CONFLICT (media_id, season_number) DO UPDATE SET episode_count = excluded.episode_count`,
    );
    input.seasons.forEach((count, i) => statements.push(upsert.bind(media.id, i + 1, count)));
  }
  await db.batch(statements);
  return true;
}

/** Saisons d'une série ajoutée à la main (pour la progression et la molette). */
export async function manualSeasons(db: D1Database, mediaId: number): Promise<SeasonInfo[]> {
  const { results } = await db
    .prepare("SELECT season_number, episode_count FROM media_seasons WHERE media_id = ? ORDER BY season_number")
    .bind(mediaId)
    .all<{ season_number: number; episode_count: number }>();
  return results.map((r) => ({ seasonNumber: r.season_number, episodeCount: r.episode_count, name: null, airDate: null }));
}
