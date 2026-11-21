// Actions de la fiche : rafraîchir les infos depuis la source, retirer de la bibliothèque,
// « Ce n'est pas la bonne œuvre » (changer la correspondance en gardant le suivi), images proposées par la source.
import { CURRENT_USER_ID, upsertMedia } from "./library";
import { getDetails } from "./sources";
import { comicCovers } from "./sources/comicvine";
import { igdbImage, igdbQuery } from "./sources/igdb";
import { malGet } from "./sources/mal";
import { tmdbGet, tmdbImage } from "./sources/tmdb";
import type { MediaType } from "./types";

/**
 * Relit l'œuvre chez sa source (titres, affiche, synopsis, nombre d'épisodes / chapitres / tomes, saisons, diffusion)
 * et met à jour le catalogue. Ton suivi et ton journal ne changent pas.
 * Manga : un MangaDex introuvable la dernière fois est recherché à nouveau.
 */
export async function refreshMedia(env: CloudflareEnv, type: MediaType, externalId: string): Promise<number> {
  const details = await getDetails(env, type, externalId);
  const mediaId = await upsertMedia(env.DB, details);
  await env.DB.prepare(
    `UPDATE media SET release_json = CASE WHEN release_json IS NULL THEN NULL ELSE json_remove(release_json, '$.checkedAt') END,
            external_links_json = CASE WHEN json_extract(external_links_json, '$.mangadex') = 'none'
                                       THEN json_remove(external_links_json, '$.mangadex') ELSE external_links_json END
     WHERE id = ?`,
  )
    .bind(mediaId)
    .run();
  return mediaId;
}

/** Retire une œuvre de la bibliothèque : son suivi, son journal et son focus partent avec (l'œuvre reste au catalogue). */
export async function removeEntry(db: D1Database, entryId: number): Promise<boolean> {
  const result = await db.prepare("DELETE FROM library_entries WHERE id = ? AND user_id = ?").bind(entryId, CURRENT_USER_ID).run();
  return (result.meta.changes ?? 0) > 0;
}

export class RematchError extends Error {}

/**
 * « Ce n'est pas la bonne œuvre » : l'entrée pointe désormais vers une autre œuvre du même type,
 * avec son statut, sa note, sa progression et son journal. Les correspondances d'import suivent,
 * pour qu'un nouvel import ne revienne pas à la mauvaise œuvre. Renvoie le nouvel identifiant (source).
 */
export async function rematchEntry(env: CloudflareEnv, entryId: number, externalId: string): Promise<{ type: MediaType; externalId: string }> {
  const db = env.DB;
  const entry = await db
    .prepare(
      `SELECT l.media_id, l.media_type, m.external_links_json FROM library_entries l JOIN media m ON m.id = l.media_id
       WHERE l.id = ? AND l.user_id = ?`,
    )
    .bind(entryId, CURRENT_USER_ID)
    .first<{ media_id: number; media_type: MediaType; external_links_json: string | null }>();
  if (!entry) throw new RematchError("Œuvre absente de ta bibliothèque.");
  const details = await getDetails(env, entry.media_type, externalId);
  const mediaId = await upsertMedia(db, details);
  if (mediaId === entry.media_id) return { type: entry.media_type, externalId: details.externalId };
  const taken = await db
    .prepare("SELECT 1 AS ok FROM library_entries WHERE user_id = ? AND media_id = ?")
    .bind(CURRENT_USER_ID, mediaId)
    .first<{ ok: number }>();
  if (taken) throw new RematchError("Cette œuvre est déjà dans ta bibliothèque : retire d'abord l'une des deux.");
  await db.batch([
    db.prepare("UPDATE library_entries SET media_id = ? WHERE id = ?").bind(mediaId, entryId),
    db.prepare("UPDATE import_links SET media_id = ? WHERE media_id = ?").bind(mediaId, entry.media_id),
    // Liens d'import (fiche Letterboxd de l'entrée…) : ils décrivent ce que tu as vu, donc la bonne œuvre.
    db
      .prepare(
        `UPDATE media SET external_links_json = json_patch(COALESCE(?, '{}'), COALESCE(external_links_json, '{}'))
         WHERE id = ? AND ? IS NOT NULL`,
      )
      .bind(entry.external_links_json, mediaId, entry.external_links_json),
  ]);
  return { type: entry.media_type, externalId: details.externalId };
}

export interface SourceImages {
  posters: string[];
  backdrops: string[];
}

interface TmdbImages {
  posters: { file_path: string }[];
  backdrops: { file_path: string }[];
}

/** Affiches et images de fond proposées par la source de l'œuvre (30 au plus de chaque). */
export async function sourceImages(env: CloudflareEnv, type: MediaType, externalId: string): Promise<SourceImages> {
  const id = Number(externalId);
  if (type === "movie" || type === "tv") {
    const data = await tmdbGet<TmdbImages>(env.TMDB_API_TOKEN, `/${type}/${id}/images`, { include_image_language: "fr,en,null" });
    return {
      posters: data.posters.slice(0, 30).map((p) => tmdbImage(p.file_path, "w500")!),
      backdrops: data.backdrops.slice(0, 30).map((b) => tmdbImage(b.file_path, "w1280")!),
    };
  }
  if (type === "anime" || type === "manga") {
    const data = await malGet<{ main_picture?: { large?: string; medium?: string }; pictures?: { large?: string; medium?: string }[] }>(
      env.MAL_CLIENT_ID,
      `/${type}/${id}`,
      { fields: "pictures" },
    );
    const all = [data.main_picture, ...(data.pictures ?? [])].map((p) => p?.large ?? p?.medium).filter((u): u is string => !!u);
    return { posters: [...new Set(all)].slice(0, 30), backdrops: [] };
  }
  if (type === "comic") {
    // Couvertures des numéros de la série (les 30 premiers).
    return { posters: await comicCovers(env, externalId), backdrops: [] };
  }
  const [game] = await igdbQuery<{ cover?: { image_id: string }; artworks?: { image_id: string }[]; screenshots?: { image_id: string }[] }[]>(
    env,
    "games",
    `fields cover.image_id, artworks.image_id, screenshots.image_id; where id = ${id};`,
  );
  return {
    posters: game?.cover ? [igdbImage(game.cover.image_id, "t_cover_big_2x")!] : [],
    backdrops: [...(game?.artworks ?? []), ...(game?.screenshots ?? [])].slice(0, 30).map((a) => igdbImage(a.image_id, "t_1080p")!),
  };
}

/**
 * Tâche programmée : relit chez leur source quelques films et jeux de la watchlist / du backlog qui ne sont pas
 * encore sortis (ou sans date), pour que les dates de « Sorties » suivent les reports. Une fois par semaine chacun ;
 * les jeux sans précision de date (ajoutés avant la v0.10) d'abord.
 */
export async function refreshUpcomingReleases(env: CloudflareEnv, limit = 2, now = Date.now()): Promise<number> {
  const today = new Date(now).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT m.type, m.external_id, m.fetched_at,
            (m.type = 'game' AND json_extract(m.extra_json, '$.releasePrecision') IS NULL) AS missing
     FROM library_entries l JOIN media m ON m.id = l.media_id
     WHERE l.user_id = ? AND l.status = 'planned' AND m.type IN ('movie', 'game') AND m.external_id IS NOT NULL
       AND (m.release_date IS NULL OR m.release_date >= ?)
       AND (m.fetched_at IS NULL OR m.fetched_at < ? OR (m.type = 'game' AND json_extract(m.extra_json, '$.releasePrecision') IS NULL))
     ORDER BY missing DESC, m.fetched_at
     LIMIT ?`,
  )
    .bind(CURRENT_USER_ID, today, new Date(now - 7 * 86400_000).toISOString(), limit)
    .all<{ type: MediaType; external_id: string }>();
  let done = 0;
  for (const row of results) {
    try {
      await refreshMedia(env, row.type, row.external_id);
      done++;
    } catch (error) {
      console.error("Date de sortie non rafraîchie", row.type, row.external_id, error);
    }
  }
  return done;
}
