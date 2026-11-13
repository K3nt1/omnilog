// Nouveautés sur ce que tu suis : nouvel épisode, nouvelle saison, suite d'anime, nouveau chapitre ou numéro de comic,
// DLC d'un jeu, film de la watchlist arrivé sur une plateforme.
// - Épisodes et chapitres : déduits du rafraîchissement des prochaines sorties (release.ts).
// - Le reste : vérifications lentes (checkDueNews), par petits lots dans la tâche programmée.
// Une première vérification note l'état sans rien signaler : seules les vraies nouveautés apparaissent.
import { ficheHref, TYPE_SLUGS } from "./labels";
import { CURRENT_USER_ID } from "./library";
import type { ReleaseInfo } from "./release-shared";
import { igdbQuery } from "./sources/igdb";
import { malGet } from "./sources/mal";
import { tmdbGet } from "./sources/tmdb";
import { NEWS_BITS, type NewsItem, type NewsKind } from "./news-shared";
import type { MediaType } from "./types";

export { NEWS_BITS, NEWS_ICONS, NEWS_LABELS, type NewsItem, type NewsKind } from "./news-shared";

/** Ce qui était connu à la dernière vérification d'une œuvre. */
export interface NewsState {
  seasons?: number;
  sequels?: number[];
  dlcs?: number[];
  providers?: number[];
  region?: string;
}

/** Statuts pour lesquels chaque nouveauté t'intéresse (jamais « abandonné »). */
const STATUSES: Record<NewsKind, string> = {
  episode: "'in_progress', 'on_hold', 'planned'",
  season: "'in_progress', 'on_hold', 'planned', 'completed'",
  sequel: "'completed', 'in_progress', 'on_hold'",
  chapter: "'in_progress', 'on_hold', 'planned'",
  dlc: "'in_progress', 'on_hold', 'planned', 'completed'",
  provider: "'planned'",
};

/** Ajoute une nouveauté pour l'œuvre `mediaId` de ta bibliothèque (rien si elle n'y est pas au bon statut ou si le type est coupé). */
export function addNews(
  db: D1Database,
  news: { mediaId: number; kind: NewsKind; label: string; detail?: string | null; url?: string | null; key: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO news (user_id, entry_id, kind, label, detail, url, dedupe_key)
       SELECT l.user_id, l.id, ?2, ?3, ?4, ?5, ?6
       FROM library_entries l JOIN users u ON u.id = l.user_id
       WHERE l.media_id = ?1 AND l.user_id = ?7 AND l.status IN (${STATUSES[news.kind]}) AND (u.news_kinds & ?8) <> 0`,
    )
    .bind(news.mediaId, news.kind, news.label.slice(0, 200), news.detail?.slice(0, 300) ?? null, news.url ?? null, news.key, CURRENT_USER_ID, NEWS_BITS[news.kind]);
}

const aired = (r: ReleaseInfo, now: number) => !!r.at && Date.parse(r.at.length === 10 ? `${r.at}T23:59:59Z` : r.at) <= now;

/**
 * Nouveautés déduites d'un changement de prochaine sortie :
 * l'épisode annoncé est sorti (et la source annonce déjà le suivant), ou un nouveau chapitre est paru.
 */
export function releaseNews(db: D1Database, mediaId: number, before: ReleaseInfo | null, after: ReleaseInfo | null, now = Date.now()): D1PreparedStatement[] {
  if (!before?.label) return [];
  // Comics : nouveauté quand le dernier numéro paru change (le prochain peut déjà être annoncé).
  if (before.lastLabel !== undefined || after?.lastLabel !== undefined) {
    if (before.lastLabel && after?.lastLabel && after.lastLabel !== before.lastLabel) {
      return [addNews(db, { mediaId, kind: "chapter", label: `${after.lastLabel} paru`, key: `chapter:${mediaId}:${after.lastLabel}` })];
    }
    return [];
  }
  if (before.kind === "next" && aired(before, now) && after?.label !== before.label) {
    return [addNews(db, { mediaId, kind: "episode", label: `${before.label} disponible`, key: `episode:${mediaId}:${before.label}` })];
  }
  if (before.kind === "last" && after?.kind === "last" && after.label && after.label !== before.label) {
    return [addNews(db, { mediaId, kind: "chapter", label: `${after.label} paru`, key: `chapter:${mediaId}:${after.label}` })];
  }
  return [];
}

/** Nouvelle saison d'une série : le nombre de saisons annoncé par TMDB augmente. */
export function seasonNews(
  db: D1Database,
  media: { id: number; state: NewsState },
  seasons: number,
  next: { season_number: number; episode_number: number; air_date: string } | null,
): { statements: D1PreparedStatement[]; state: NewsState } {
  const known = media.state.seasons;
  const statements: D1PreparedStatement[] = [];
  if (known !== undefined && seasons > known) {
    const date = next && next.season_number === seasons && next.air_date ? next.air_date : null;
    statements.push(
      addNews(db, {
        mediaId: media.id,
        kind: "season",
        label: `Saison ${seasons} annoncée`,
        detail: date ? `Premier épisode le ${new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : null,
        key: `season:${media.id}:${seasons}`,
      }),
    );
  }
  return { statements, state: { ...media.state, seasons: Math.max(seasons, known ?? 0) } };
}


/** Le fil : non vues d'abord, puis les plus récentes (30 jours), éventuellement d'un seul type. */
export async function listNews(db: D1Database, options: { type?: MediaType | null; limit?: number; unseenOnly?: boolean } = {}): Promise<NewsItem[]> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT n.id, n.kind, n.label, n.detail, n.url, n.created_at, n.seen_at,
              m.title, m.type, m.external_id, COALESCE(l.custom_poster_url, m.poster_url) AS poster_url
       FROM news n JOIN library_entries l ON l.id = n.entry_id JOIN media m ON m.id = l.media_id JOIN users u ON u.id = n.user_id
       WHERE n.user_id = ? AND n.created_at >= ? AND (u.news_kinds & CASE n.kind
               WHEN 'episode' THEN 1 WHEN 'season' THEN 2 WHEN 'chapter' THEN 4 WHEN 'dlc' THEN 8 WHEN 'provider' THEN 16 ELSE 32 END) <> 0
         AND (?3 IS NULL OR m.type = ?3) AND (?4 = 0 OR n.seen_at IS NULL)
       ORDER BY n.seen_at IS NOT NULL, n.created_at DESC, n.id DESC
       LIMIT ?5`,
    )
    .bind(CURRENT_USER_ID, since, options.type ?? null, options.unseenOnly ? 1 : 0, options.limit ?? 50)
    .all<{
      id: number;
      kind: NewsKind;
      label: string;
      detail: string | null;
      url: string | null;
      created_at: string;
      seen_at: string | null;
      title: string;
      type: MediaType;
      external_id: string | null;
      poster_url: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    detail: r.detail,
    url: r.url ?? ficheHref(r.type, r.external_id),
    createdAt: r.created_at,
    seen: r.seen_at !== null,
    work: { title: r.title, type: r.type, posterUrl: r.poster_url },
  }));
}

export async function countUnseenNews(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM news n JOIN users u ON u.id = n.user_id
       WHERE n.user_id = ? AND n.seen_at IS NULL AND n.created_at >= ?
         AND (u.news_kinds & CASE n.kind WHEN 'episode' THEN 1 WHEN 'season' THEN 2 WHEN 'chapter' THEN 4
              WHEN 'dlc' THEN 8 WHEN 'provider' THEN 16 ELSE 32 END) <> 0`,
    )
    .bind(CURRENT_USER_ID, new Date(Date.now() - 30 * 86400_000).toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Marque des nouveautés comme vues (toutes si `ids` est absent). */
export async function markNewsSeen(db: D1Database, ids?: number[]): Promise<number> {
  const now = new Date().toISOString();
  const result = ids
    ? await db
        .prepare("UPDATE news SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL AND id IN (SELECT value FROM json_each(?))")
        .bind(now, CURRENT_USER_ID, JSON.stringify(ids.slice(0, 500)))
        .run()
    : await db.prepare("UPDATE news SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL").bind(now, CURRENT_USER_ID).run();
  return result.meta.changes ?? 0;
}

/** Résumé pour la quête du jour : « 🆕 3 nouveautés : Severance (Saison 3 annoncée), … ». */
export async function newsSummary(db: D1Database, since: string | null): Promise<string | null> {
  const items = (await listNews(db, { unseenOnly: true, limit: 20 })).filter((n) => !since || n.createdAt > since);
  if (items.length === 0) return null;
  const shown = items.slice(0, 3).map((n) => `${n.work.title} (${n.label})`);
  return `🆕 ${items.length} nouveauté${items.length > 1 ? "s" : ""} : ${shown.join(", ")}${items.length > 3 ? "…" : ""}`;
}

export async function getNewsKinds(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT news_kinds FROM users WHERE id = ?").bind(CURRENT_USER_ID).first<{ news_kinds: number }>();
  return row?.news_kinds ?? 63;
}

export async function setNewsKinds(db: D1Database, mask: number): Promise<void> {
  await db.prepare("UPDATE users SET news_kinds = ? WHERE id = ?").bind(mask, CURRENT_USER_ID).run();
}

// ---------- Vérifications lentes ----------

/** Délai entre deux vérifications : plateformes 3 jours, saisons et DLC 7 jours, suites d'anime 30 jours. */
const RECHECK_DAYS = { provider: 3, season: 7, dlc: 7, sequel: 30 };

interface DueRow {
  id: number;
  type: MediaType;
  external_id: string;
  title: string;
  news_state_json: string | null;
}

interface TmdbProvidersResponse {
  results?: Record<string, { flatrate?: { provider_id: number; provider_name: string }[]; free?: { provider_id: number; provider_name: string }[]; ads?: { provider_id: number; provider_name: string }[] }>;
}

/** Plateformes d'un film dans ton pays (abonnement, gratuit, avec pub). */
async function checkProviders(env: CloudflareEnv, row: DueRow, state: NewsState, region: string): Promise<{ statements: D1PreparedStatement[]; state: NewsState }> {
  const data = await tmdbGet<TmdbProvidersResponse>(env.TMDB_API_TOKEN, `/movie/${Number(row.external_id)}/watch/providers`);
  const r = data.results?.[region];
  const offers = [...(r?.flatrate ?? []), ...(r?.free ?? []), ...(r?.ads ?? [])];
  const ids = [...new Set(offers.map((o) => o.provider_id))];
  // Premier passage, ou pays changé dans Réglages : on note sans rien signaler.
  if (state.providers === undefined || state.region !== region) return { statements: [], state: { ...state, providers: ids, region } };
  const added = offers.filter((o, i) => !state.providers!.includes(o.provider_id) && offers.findIndex((x) => x.provider_id === o.provider_id) === i);
  return {
    statements: added.map((o) =>
      addNews(env.DB, {
        mediaId: row.id,
        kind: "provider",
        label: `Disponible sur ${o.provider_name}`,
        key: `provider:${row.id}:${region}:${o.provider_id}`,
      }),
    ),
    state: { ...state, providers: ids, region },
  };
}

/** Série (même terminée) : nouvelle saison annoncée ? Une série relancée redevient « en diffusion ». */
async function checkSeasons(env: CloudflareEnv, row: DueRow, state: NewsState): Promise<{ statements: D1PreparedStatement[]; state: NewsState }> {
  const s = await tmdbGet<{ number_of_seasons: number; in_production: boolean; next_episode_to_air: { season_number: number; episode_number: number; air_date: string } | null }>(
    env.TMDB_API_TOKEN,
    `/tv/${Number(row.external_id)}`,
  );
  const result = seasonNews(env.DB, { id: row.id, state }, s.number_of_seasons, s.next_episode_to_air);
  if (s.in_production) result.statements.push(env.DB.prepare("UPDATE media SET is_ongoing = 1 WHERE id = ?").bind(row.id));
  return result;
}

/** Anime : une suite (MAL « sequel ») apparue depuis la dernière vérification, pas encore dans ta bibliothèque. */
async function checkSequel(env: CloudflareEnv, row: DueRow, state: NewsState): Promise<{ statements: D1PreparedStatement[]; state: NewsState }> {
  const data = await malGet<{ related_anime?: { node: { id: number; title: string }; relation_type: string }[] }>(
    env.MAL_CLIENT_ID,
    `/anime/${Number(row.external_id)}`,
    { fields: "related_anime" },
  );
  const sequels = (data.related_anime ?? []).filter((r) => r.relation_type === "sequel").map((r) => r.node);
  const ids = sequels.map((s) => s.id);
  if (state.sequels === undefined) return { statements: [], state: { ...state, sequels: ids } };
  const statements = sequels
    .filter((s) => !state.sequels!.includes(s.id))
    .map((s) => addSequelNews(env.DB, row.id, s));
  return { statements, state: { ...state, sequels: [...new Set([...state.sequels, ...ids])] } };
}

function addSequelNews(db: D1Database, mediaId: number, sequel: { id: number; title: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO news (user_id, entry_id, kind, label, url, dedupe_key)
       SELECT l.user_id, l.id, 'sequel', ?2, ?3, ?4
       FROM library_entries l JOIN users u ON u.id = l.user_id
       WHERE l.media_id = ?1 AND l.user_id = ?5 AND l.status IN (${STATUSES.sequel}) AND (u.news_kinds & 32) <> 0
         AND NOT EXISTS (SELECT 1 FROM library_entries l2 JOIN media m2 ON m2.id = l2.media_id
                         WHERE l2.user_id = ?5 AND m2.type = 'anime' AND m2.source = 'mal' AND m2.external_id = ?6)`,
    )
    .bind(mediaId, `Suite : ${sequel.title}`.slice(0, 200), `/oeuvre/${TYPE_SLUGS.anime}/${sequel.id}`, `sequel:${mediaId}:${sequel.id}`, CURRENT_USER_ID, String(sequel.id));
}

/** Jeu : DLC et extensions (IGDB : DLC, extension, extension autonome). */
async function checkDlcs(env: CloudflareEnv, row: DueRow, state: NewsState): Promise<{ statements: D1PreparedStatement[]; state: NewsState }> {
  const games = await igdbQuery<{ id: number; name: string; first_release_date?: number; game_type?: number | { id: number }; category?: number }[]>(
    env,
    "games",
    `fields id, name, first_release_date, game_type, category; where parent_game = ${Number(row.external_id)}; limit 100;`,
  );
  const typeOf = (g: (typeof games)[number]) => (typeof g.game_type === "object" ? g.game_type?.id : (g.game_type ?? g.category));
  const dlcs = games.filter((g) => [1, 2, 4].includes(typeOf(g) ?? -1));
  const ids = dlcs.map((g) => g.id);
  if (state.dlcs === undefined) return { statements: [], state: { ...state, dlcs: ids } };
  const statements = dlcs
    .filter((g) => !state.dlcs!.includes(g.id))
    .map((g) => {
      const date = g.first_release_date ? new Date(g.first_release_date * 1000) : null;
      const when = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
      return addNews(env.DB, {
        mediaId: row.id,
        kind: "dlc",
        label: `${typeOf(g) === 1 ? "DLC" : "Extension"} : ${g.name}`,
        detail: when ? (date!.getTime() > Date.now() ? `Sortie prévue le ${when}` : `Sorti le ${when}`) : "Date de sortie inconnue",
        url: `/oeuvre/${TYPE_SLUGS.game}/${g.id}`,
        key: `dlc:${row.id}:${g.id}`,
      });
    });
  return { statements, state: { ...state, dlcs: [...new Set([...state.dlcs, ...ids])] } };
}

/**
 * Vérifications lentes (tâche programmée) : au plus `limit` œuvres, celles dont la dernière vérification
 * est la plus ancienne. Les types de nouveautés coupés dans Réglages ne sont pas vérifiés.
 */
export async function checkDueNews(env: CloudflareEnv, limit = 8, now = Date.now()): Promise<number> {
  const [kinds, regionRow] = await Promise.all([
    getNewsKinds(env.DB),
    env.DB.prepare("SELECT watch_region FROM users WHERE id = ?").bind(CURRENT_USER_ID).first<{ watch_region: string }>(),
  ]);
  const region = regionRow?.watch_region ?? "FR";
  const before = (days: number) => new Date(now - days * 86400_000).toISOString();
  const wanted: string[] = [];
  const params: unknown[] = [];
  if (kinds & NEWS_BITS.provider) {
    wanted.push("(m.type = 'movie' AND l.status = 'planned' AND (m.news_checked_at IS NULL OR m.news_checked_at < ?))");
    params.push(before(RECHECK_DAYS.provider));
  }
  if (kinds & NEWS_BITS.season) {
    wanted.push("(m.type = 'tv' AND l.status <> 'dropped' AND (m.news_checked_at IS NULL OR m.news_checked_at < ?))");
    params.push(before(RECHECK_DAYS.season));
  }
  if (kinds & NEWS_BITS.sequel) {
    wanted.push("(m.type = 'anime' AND l.status IN ('completed', 'in_progress', 'on_hold') AND (m.news_checked_at IS NULL OR m.news_checked_at < ?))");
    params.push(before(RECHECK_DAYS.sequel));
  }
  if (kinds & NEWS_BITS.dlc) {
    wanted.push("(m.type = 'game' AND l.status <> 'dropped' AND (m.news_checked_at IS NULL OR m.news_checked_at < ?))");
    params.push(before(RECHECK_DAYS.dlc));
  }
  if (wanted.length === 0) return 0;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.type, m.external_id, m.title, m.news_state_json
     FROM library_entries l JOIN media m ON m.id = l.media_id
     WHERE l.user_id = ? AND m.external_id IS NOT NULL AND (${wanted.join(" OR ")})
     ORDER BY m.news_checked_at IS NOT NULL, m.news_checked_at
     LIMIT ?`,
  )
    .bind(CURRENT_USER_ID, ...params, limit)
    .all<DueRow>();
  for (const row of results) {
    const state: NewsState = row.news_state_json ? (JSON.parse(row.news_state_json) as NewsState) : {};
    let result: { statements: D1PreparedStatement[]; state: NewsState } = { statements: [], state };
    try {
      if (row.type === "movie") result = await checkProviders(env, row, state, region);
      else if (row.type === "tv") result = await checkSeasons(env, row, state);
      else if (row.type === "anime") result = await checkSequel(env, row, state);
      else if (row.type === "game") result = await checkDlcs(env, row, state);
    } catch (error) {
      console.error("Vérification des nouveautés en échec", row.type, row.external_id, error);
    }
    await env.DB.batch([
      ...result.statements,
      env.DB.prepare("UPDATE media SET news_state_json = ?, news_checked_at = ? WHERE id = ?").bind(
        JSON.stringify(result.state),
        new Date(now).toISOString(),
        row.id,
      ),
    ]);
  }
  return results.length;
}
