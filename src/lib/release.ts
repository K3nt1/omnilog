// Prochaines sorties d'une œuvre en diffusion, enregistrées dans media.release_json :
// - série : prochain épisode annoncé par TMDB (date seule) ;
// - anime : prochain épisode et heure exacte, d'après AniList (identifiant MAL) ;
// - manga : dernier chapitre paru et sa date, d'après MangaDex (pas d'estimation).
// Rafraîchi à chaque visite de la fiche (MangaDex au plus toutes les 12 h) ; la v0.7 le fera chaque jour.
import type { MediaFiche } from "./fiche/types";
import { fetchJson } from "./sources/http";
import { findMangadexId, latestChapter, mangadexIdFromLink, mangadexLink } from "./sources/mangadex";
import type { ReleaseInfo } from "./release-shared";
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
  data?: { Media?: { nextAiringEpisode?: { episode: number; airingAt: number } | null } | null };
}

/** Prochain épisode d'un anime (numéro, heure exacte) d'après AniList, à partir de l'identifiant MyAnimeList. */
async function aniListNext(malId: string): Promise<ReleaseInfo | null> {
  const data = await fetchJson<AniListResponse>("AniList", "https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: "query ($id: Int) { Media(idMal: $id, type: ANIME) { nextAiringEpisode { episode airingAt } } }",
      variables: { id: Number(malId) },
    }),
  });
  const next = data.data?.Media?.nextAiringEpisode;
  return next ? { kind: "next", label: `Ép. ${next.episode}`, at: new Date(next.airingAt * 1000).toISOString(), precision: "time" } : null;
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
    else if (type === "anime") next = await aniListNext(media.externalId);
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
