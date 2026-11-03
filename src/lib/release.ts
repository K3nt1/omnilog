// Prochaines sorties d'une œuvre en diffusion, enregistrées dans media.release_json :
// - série : prochain épisode annoncé par TMDB (date seule) ;
// - anime : prochain épisode et heure exacte, d'après AniList (identifiant MAL) ;
// - manga : dernier chapitre paru et sa date, d'après MangaDex (pas d'estimation).
// Rafraîchi à chaque visite de la fiche (MangaDex au plus toutes les 12 h) ; la v0.7 le fera chaque jour.
import type { MediaFiche } from "./fiche/types";
import { fetchJson } from "./sources/http";
import { findMangadexId, latestChapter, mangadexIdFromLink, mangadexLink } from "./sources/mangadex";
import { parseRelease, type ReleaseInfo } from "./release-shared";
import { tmdbGet } from "./sources/tmdb";
import type { MediaType } from "./types";

const MANGA_RECHECK_MS = 12 * 3600_000;

/** Identifiant MangaDex d'un manga, retrouvé une fois puis gardé dans les liens de l'œuvre (« none » si introuvable). */
export async function mangadexIdFor(
  db: D1Database,
  media: { id: number; externalId: string; title: string; originalTitle: string | null; externalLinks: Record<string, string> },
): Promise<string | null> {
  const known = media.externalLinks.mangadex;
  if (known) return mangadexIdFromLink(known);
  const id = await findMangadexId(media.externalId, [media.title, media.originalTitle]);
  await db
    .prepare("UPDATE media SET external_links_json = json_set(COALESCE(external_links_json, '{}'), '$.mangadex', ?) WHERE id = ?")
    .bind(id ? mangadexLink(id) : "none", media.id)
    .run();
  return id;
}

interface AniListResponse {
  data?: { Media?: { status?: string; nextAiringEpisode?: { episode: number; airingAt: number } | null } | null };
}

/** Diffusion d'un anime d'après AniList : encore en cours ? prochain épisode (numéro, heure exacte) ? */
export async function aniListAiring(malId: string): Promise<{ ongoing: boolean; next: ReleaseInfo | null }> {
  const data = await fetchJson<AniListResponse>("AniList", "https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: "query ($id: Int) { Media(idMal: $id, type: ANIME) { status nextAiringEpisode { episode airingAt } } }",
      variables: { id: Number(malId) },
    }),
  });
  const media = data.data?.Media;
  const next = media?.nextAiringEpisode;
  return {
    ongoing: media?.status !== "FINISHED" && media?.status !== "CANCELLED",
    next: next ? { kind: "next", label: `Ép. ${next.episode}`, at: new Date(next.airingAt * 1000).toISOString(), precision: "time" } : null,
  };
}

const sameRelease = (a: ReleaseInfo | null, b: ReleaseInfo | null) =>
  (a === null && b === null) || (a !== null && b !== null && a.kind === b.kind && a.label === b.label && a.at === b.at);

export interface ReleaseMedia {
  id: number;
  externalId: string;
  title: string;
  originalTitle: string | null;
  externalLinks: Record<string, string>;
  release: ReleaseInfo | null;
}

/**
 * Met à jour la prochaine sortie d'une œuvre en base et la renvoie.
 * Une source qui ne répond pas laisse la valeur enregistrée telle quelle.
 */
export async function refreshRelease(
  env: CloudflareEnv,
  type: MediaType,
  media: ReleaseMedia,
  fiche: Pick<MediaFiche, "isOngoing" | "nextRelease">,
  force = false,
): Promise<ReleaseInfo | null> {
  let next: ReleaseInfo | null = media.release;
  try {
    if (!fiche.isOngoing || type === "movie" || type === "game") next = null;
    else if (type === "tv") next = fiche.nextRelease;
    else if (type === "anime") next = fiche.nextRelease ?? (await aniListAiring(media.externalId)).next;
    else {
      const checked = media.release?.checkedAt ? Date.parse(media.release.checkedAt) : 0;
      if (!force && Date.now() - checked < MANGA_RECHECK_MS) return media.release?.label ? media.release : null;
      const id = await mangadexIdFor(env.DB, media);
      const last = id ? await latestChapter(id) : null;
      next = last
        ? { kind: "last", label: `Ch. ${String(last.chapter).replace(".", ",")}`, at: last.at, precision: "day", checkedAt: new Date().toISOString() }
        : { kind: "last", label: "", at: null, precision: "day", checkedAt: new Date().toISOString() };
    }
  } catch (error) {
    console.error("Prochaine sortie indisponible", type, media.externalId, error);
    return media.release?.label ? media.release : null;
  }
  // Manga : on garde la date de vérification même quand rien ne change, pour ne pas redemander à chaque visite.
  if (!sameRelease(next, media.release) || (type === "manga" && next !== null)) {
    await env.DB.prepare("UPDATE media SET release_json = ? WHERE id = ?")
      .bind(next ? JSON.stringify(next) : null, media.id)
      .run();
  }
  return next && next.label ? next : null;
}

interface TmdbTvAiring {
  in_production: boolean;
  next_episode_to_air: { air_date: string; season_number: number; episode_number: number } | null;
}

/** Prochain épisode d'une série d'après TMDB (requête légère, sans crédits ni plateformes). */
async function tmdbTvAiring(token: string, id: string): Promise<Pick<MediaFiche, "isOngoing" | "nextRelease">> {
  const s = await tmdbGet<TmdbTvAiring>(token, `/tv/${Number(id)}`);
  const next = s.next_episode_to_air;
  return {
    isOngoing: s.in_production,
    nextRelease:
      next && next.air_date
        ? {
            kind: "next",
            label: `S${String(next.season_number).padStart(2, "0")}E${String(next.episode_number).padStart(2, "0")}`,
            at: next.air_date,
            precision: "day",
          }
        : null,
  };
}

/**
 * Rafraîchissement automatique (tâche programmée) : les œuvres en diffusion de la bibliothèque
 * les moins récemment vérifiées. Au plus `limit` œuvres, pour rester sous les 50 appels sortants
 * d'une exécution (un manga peut en demander 3). Renvoie le nombre d'œuvres vérifiées.
 */
export async function refreshDueReleases(env: CloudflareEnv, limit = 8): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.type, m.external_id, m.title, m.original_title, m.external_links_json, m.release_json
     FROM media m
     WHERE m.is_ongoing = 1 AND m.type IN ('tv', 'anime', 'manga') AND m.external_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM library_entries l WHERE l.media_id = m.id AND l.status <> 'dropped')
       AND (m.release_checked_at IS NULL OR m.release_checked_at < ?)
     ORDER BY m.release_checked_at IS NOT NULL, m.release_checked_at
     LIMIT ?`,
  )
    .bind(new Date(Date.now() - 20 * 3600_000).toISOString(), limit)
    .all<{
      id: number;
      type: MediaType;
      external_id: string;
      title: string;
      original_title: string | null;
      external_links_json: string | null;
      release_json: string | null;
    }>();
  for (const row of results) {
    const media: ReleaseMedia = {
      id: row.id,
      externalId: row.external_id,
      title: row.title,
      originalTitle: row.original_title,
      externalLinks: row.external_links_json ? (JSON.parse(row.external_links_json) as Record<string, string>) : {},
      release: parseRelease(row.release_json),
    };
    try {
      const fiche =
        row.type === "tv"
          ? await tmdbTvAiring(env.TMDB_API_TOKEN, row.external_id)
          : row.type === "anime"
            ? await aniListAiring(row.external_id).then((a) => ({ isOngoing: a.ongoing, nextRelease: a.next }))
            : { isOngoing: true, nextRelease: null };
      if (!fiche.isOngoing) await env.DB.prepare("UPDATE media SET is_ongoing = 0 WHERE id = ?").bind(row.id).run();
      await refreshRelease(env, row.type, media, fiche, true);
    } catch (error) {
      console.error("Rafraîchissement automatique en échec", row.type, row.external_id, error);
    }
    await env.DB.prepare("UPDATE media SET release_checked_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  }
  return results.length;
}
