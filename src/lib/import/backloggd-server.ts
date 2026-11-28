// Import Backloggd côté serveur : un paquet de jeux en 1 requête IGDB et 3 lots D1.
// Backloggd reprend les slugs d'IGDB (sa page de jeu renvoie vers igdb.com/games/<slug>) : la correspondance est sûre.
import { CURRENT_USER_ID, findImportLinks, upsertMediaStatement } from "../library";
import { SourceError } from "../sources/http";
import { findIgdbGamesByTitles, getIgdbGamesBySlugs, normalizeGameTitle } from "../sources/igdb";
import { manualDetails, newManualId } from "../manual";
import { storedStatus, yearOf, type MediaDetails } from "../types";
import type { BackloggdGame, GameCandidate, ImportItemResult } from "./types";

/** Champs d'un jeu ajouté à la main d'après son seul titre (le reste se complète sur sa fiche). */
const manualFields = (title: string) => ({
  title: title.slice(0, 200),
  release: null,
  overview: null,
  runtimeMinutes: null,
  totalEpisodes: null,
  seasons: [],
  totalChapters: null,
  totalVolumes: null,
  platforms: [],
});

/** Parmi ces jeux déjà importés, ceux qui ont été ajoutés à la main : leur fiche et leur entrée de bibliothèque. */
async function handAdded(
  db: D1Database,
  items: BackloggdGame[],
  known: Map<string, { mediaId: number }>,
): Promise<Map<string, { ficheId: string; entryId: number | null }>> {
  const byMedia = new Map(items.map((i) => [known.get(i.key)!.mediaId, i.key]));
  if (byMedia.size === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT m.id, m.external_id, l.id AS entry_id FROM media m LEFT JOIN library_entries l ON l.media_id = m.id AND l.user_id = ?
       WHERE m.source = 'manual' AND m.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(CURRENT_USER_ID, JSON.stringify([...byMedia.keys()]))
    .all<{ id: number; external_id: string; entry_id: number | null }>();
  return new Map(results.map((r) => [byMedia.get(r.id)!, { ficheId: r.external_id, entryId: r.entry_id }]));
}

/** Parmi ces jeux IGDB, ceux déjà dans ta bibliothèque. */
async function ownedGames(db: D1Database, externalIds: string[]): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT m.external_id FROM media m JOIN library_entries l ON l.media_id = m.id AND l.user_id = ?
       WHERE m.type = 'game' AND m.source = 'igdb' AND m.external_id IN (SELECT value FROM json_each(?))`,
    )
    .bind(CURRENT_USER_ID, JSON.stringify([...new Set(externalIds)]))
    .all<{ external_id: string }>();
  return new Set(results.map((r) => r.external_id));
}

/** Clé d'une session au journal : un import relancé ne la duplique pas (deux sessions le même jour : :0, :1…). */
export function sessionRefs(game: Pick<BackloggdGame, "slug" | "sessions">): string[] {
  const perDay = new Map<string, number>();
  return game.sessions.map((s) => {
    const n = perDay.get(s.date) ?? 0;
    perDay.set(s.date, n + 1);
    return `bkl:${game.slug}:${s.date}:${n}`;
  });
}

export async function importBackloggdBatch(env: CloudflareEnv, items: BackloggdGame[]): Promise<ImportItemResult[]> {
  const db = env.DB;
  const known = await findImportLinks(db, "backloggd", items.map((i) => i.key));
  const results = new Map<string, ImportItemResult>();
  /** Jeux absents d'IGDB ajoutés à la main : leur fiche et les jeux IGDB proches pour les remplacer. */
  const manual = new Map<string, { ficheId: string; candidates: GameCandidate[] }>();
  /** Jeux reliés autrement que par leur slug : le message à afficher. */
  const linkedTo = new Map<string, string>();
  const mediaIds = new Map<string, number>();
  for (const item of items) {
    const link = known.get(item.key);
    if (link) mediaIds.set(item.key, link.mediaId);
  }

  // Jeux ajoutés à la main par un import précédent : IGDB les fournit peut-être (de nouveau), on retente par titre.
  const retry = await handAdded(db, items.filter((i) => known.has(i.key)), known);
  /** Jeux à la main retrouvés : l'entrée passe sur le jeu IGDB (ou fusionne avec celle qui l'a déjà). */
  const relink = new Map<string, { entryId: number; owned: boolean }>();

  // Jeux pas encore reconnus : une seule requête IGDB par slug, et par identifiant Backloggd en secours.
  const unknown = items.filter((i) => !mediaIds.has(i.key));
  if (unknown.length > 0 || retry.size > 0) {
    let lookup: Awaited<ReturnType<typeof getIgdbGamesBySlugs>> = { bySlug: new Map(), byId: new Map() };
    if (unknown.length > 0) {
      try {
        lookup = await getIgdbGamesBySlugs(
          env,
          unknown.map((i) => i.slug),
          unknown.flatMap((i) => (i.gameId ? [i.gameId] : [])),
        );
      } catch (error) {
        const message = error instanceof SourceError || error instanceof Error ? error.message : "IGDB ne répond pas";
        for (const i of unknown) results.set(i.key, { key: i.key, label: i.title, status: "error", message });
      }
    }
    const matched: { item: BackloggdGame; details: MediaDetails }[] = [];
    const missing: BackloggdGame[] = [];
    for (const item of unknown) {
      if (results.has(item.key)) continue;
      const byId = item.gameId ? lookup.byId.get(String(item.gameId)) : undefined;
      // L'identifiant Backloggd n'est retenu que s'il désigne bien le même jeu chez IGDB.
      const details = lookup.bySlug.get(item.slug) ?? (byId && normalizeGameTitle(byId.title) === normalizeGameTitle(item.title) ? byId : undefined);
      if (details) matched.push({ item, details });
      else missing.push(item);
    }
    const retried = items.filter((i) => retry.has(i.key));
    // Deuxième chance : slug changé chez IGDB depuis l'ajout sur Backloggd → recherche par titre identique.
    let byTitle: Awaited<ReturnType<typeof findIgdbGamesByTitles>> = { found: new Map(), candidates: new Map(), searched: new Set() };
    let titleSearchFailed = false;
    if (missing.length > 0 || retried.length > 0) {
      try {
        // Les nouveaux jeux d'abord : ce sont eux qui risquent sinon d'être ajoutés à la main pour rien.
        byTitle = await findIgdbGamesByTitles(env, [...missing, ...retried].map((i) => i.title));
      } catch (error) {
        titleSearchFailed = true;
        console.error("Recherche IGDB par titre en échec", error);
      }
    }
    // Jeu proche déjà dans ta bibliothèque (ajouté via la recherche) : c'est lui, pas besoin d'un jeu ajouté à la main.
    const nearIds = [...byTitle.candidates.values(), ...byTitle.found.values()].flat().map((d) => d.externalId);
    const owned = nearIds.length > 0 ? await ownedGames(db, nearIds) : new Set<string>();
    const toCandidates = (near: MediaDetails[]): GameCandidate[] =>
      near.map((d) => ({ externalId: d.externalId, title: d.title, year: yearOf(d.releaseDate), posterUrl: d.posterUrl }));
    for (const item of missing) {
      const title = item.title.trim();
      const exact = byTitle.found.get(title);
      if (exact) {
        matched.push({ item, details: exact });
        continue;
      }
      const near = byTitle.candidates.get(title) ?? [];
      const mine = near.find((d) => owned.has(d.externalId));
      if (mine) {
        matched.push({ item, details: mine });
        linkedTo.set(item.key, `Relié à « ${mine.title} », déjà dans ta bibliothèque.`);
        continue;
      }
      if (titleSearchFailed || !byTitle.searched.has(title)) {
        // IGDB indisponible (ou trop de jeux à chercher d'un coup) : rien n'est créé à la main, il suffira de relancer.
        results.set(item.key, { key: item.key, label: item.title, status: "error", message: "IGDB n'a pas pu être interrogé : relance l'import." });
        continue;
      }
      // Absent d'IGDB (jeu retiré de son API, mais encore sur Backloggd) : ajouté à la main, avec sa jaquette.
      const details = manualDetails({ ...manualFields(item.title), type: "game", posterUrl: item.cover ?? null }, newManualId());
      matched.push({ item, details });
      manual.set(item.key, { ficheId: details.externalId, candidates: toCandidates(near) });
    }
    for (const item of retried) {
      const hand = retry.get(item.key)!;
      const title = item.title.trim();
      const near = byTitle.candidates.get(title) ?? [];
      const found = byTitle.found.get(title) ?? near.find((d) => owned.has(d.externalId));
      if (found && hand.entryId !== null) {
        matched.push({ item, details: found });
        relink.set(item.key, { entryId: hand.entryId, owned: owned.has(found.externalId) });
        linkedTo.set(item.key, `Retrouvé chez IGDB : « ${found.title} ».`);
      } else {
        // Toujours absent : il reste à la main, avec les jeux proches à proposer.
        manual.set(item.key, { ficheId: hand.ficheId, candidates: toCandidates(near) });
      }
    }
    if (matched.length > 0) {
      // Un jeu déjà au catalogue garde sa fiche complète (durée de vie…).
      const rows = await db.batch<{ id: number }>(matched.map((m) => upsertMediaStatement(db, m.details, true)));
      matched.forEach((m, index) => {
        const id = rows[index]?.results[0]?.id;
        if (id !== undefined) mediaIds.set(m.item.key, id);
        else results.set(m.item.key, { key: m.item.key, label: m.item.title, status: "error", message: "Jeu non enregistré" });
      });
    }
  }

  // Bibliothèque, lien d'import, lien Backloggd, sessions : un seul lot pour tout le paquet.
  const statements: D1PreparedStatement[] = [];
  const entry = (mediaId: number) => [CURRENT_USER_ID, mediaId] as const;
  const entryId = "(SELECT id FROM library_entries WHERE user_id = ? AND media_id = ?)";
  // Jeux à la main retrouvés chez IGDB : d'abord, l'entrée passe sur le jeu IGDB.
  for (const [key, link] of relink) {
    const mediaId = mediaIds.get(key);
    if (mediaId === undefined || results.has(key)) continue;
    if (link.owned) {
      // Le jeu IGDB est déjà dans ta bibliothèque : son journal reçoit celui du jeu à la main, qui est retiré.
      statements.push(
        db.prepare(`UPDATE OR IGNORE progress_log SET entry_id = ${entryId} WHERE entry_id = ?`).bind(...entry(mediaId), link.entryId),
        db.prepare("DELETE FROM library_entries WHERE id = ? AND user_id = ?").bind(link.entryId, CURRENT_USER_ID),
      );
    } else {
      statements.push(db.prepare("UPDATE library_entries SET media_id = ? WHERE id = ? AND user_id = ?").bind(mediaId, link.entryId, CURRENT_USER_ID));
    }
  }
  for (const item of items) {
    const mediaId = mediaIds.get(item.key);
    if (mediaId === undefined) continue;
    const stored = storedStatus(item.status);
    statements.push(
      db
        .prepare(
          `INSERT INTO import_links (source, external_key, media_id) VALUES ('backloggd', ?, ?)
           ON CONFLICT (source, external_key) DO UPDATE SET media_id = excluded.media_id`,
        )
        .bind(item.key, mediaId),
      // Relancer l'import reprend l'état de Backloggd (statut, note) ; le 🏆 n'est jamais retiré.
      db
        .prepare(
          `INSERT INTO library_entries (user_id, media_id, media_type, status, substatus, rating, mastered)
           VALUES (?, ?, 'game', ?, ?, ?, ?)
           ON CONFLICT (user_id, media_id) DO UPDATE SET
             status = excluded.status, substatus = excluded.substatus,
             rating = COALESCE(excluded.rating, rating), mastered = MAX(mastered, excluded.mastered)`,
        )
        .bind(...entry(mediaId), stored.status, stored.substatus, item.rating, item.mastered ? 1 : 0),
      db
        .prepare(
          `UPDATE media SET external_links_json = json_set(COALESCE(external_links_json, '{}'), '$.backloggd', ?)
           WHERE id = ? AND json_extract(COALESCE(external_links_json, '{}'), '$.backloggd') IS NULL`,
        )
        .bind(`https://backloggd.com/games/${item.slug}/`, mediaId),
    );
    if (item.status !== "in_progress") {
      statements.push(db.prepare(`DELETE FROM focus WHERE entry_id = ${entryId}`).bind(...entry(mediaId)));
    }
    if (item.sessions.length > 0) {
      const refs = sessionRefs(item);
      const insert = db.prepare(
        `INSERT OR IGNORE INTO progress_log (entry_id, kind, duration_minutes, external_ref, logged_at, undated)
         VALUES (${entryId}, 'session', ?, ?, ?, 0)`,
      );
      // Date seule : enregistrée à midi UTC, elle reste sur son jour dans le calendrier quel que soit le fuseau.
      item.sessions.forEach((s, i) => statements.push(insert.bind(...entry(mediaId), s.minutes, refs[i], `${s.date}T12:00:00.000Z`)));
      // Compteurs du jeu d'après son journal, et date de début = première session.
      statements.push(
        db
          .prepare(
            `UPDATE library_entries SET
               sessions_count = (SELECT COUNT(*) FROM progress_log p WHERE p.entry_id = library_entries.id AND p.kind = 'session'),
               playtime_minutes = (SELECT SUM(p.duration_minutes) FROM progress_log p WHERE p.entry_id = library_entries.id AND p.kind = 'session'),
               started_at = COALESCE(started_at, (SELECT MIN(substr(p.logged_at, 1, 10)) FROM progress_log p
                                                  WHERE p.entry_id = library_entries.id AND p.kind = 'session' AND p.undated = 0))
             WHERE user_id = ? AND media_id = ?`,
          )
          .bind(...entry(mediaId)),
      );
    }
  }
  if (statements.length > 0) {
    try {
      await db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enregistrement impossible";
      for (const item of items) if (mediaIds.has(item.key)) results.set(item.key, { key: item.key, label: item.title, status: "error", message });
    }
  }
  // Entrées des jeux ajoutés à la main : pour « C'est celui-ci » (remplacer par le jeu IGDB) depuis l'import.
  const entryIds = new Map<number, number>();
  const manualMedia = [...manual.keys()].flatMap((key) => (results.has(key) ? [] : [mediaIds.get(key)!]));
  if (manualMedia.length > 0) {
    const { results: rows } = await db
      .prepare("SELECT id, media_id FROM library_entries WHERE user_id = ? AND media_id IN (SELECT value FROM json_each(?))")
      .bind(CURRENT_USER_ID, JSON.stringify(manualMedia))
      .all<{ id: number; media_id: number }>();
    for (const r of rows) entryIds.set(r.media_id, r.id);
  }
  return items.map((item) => {
    const done = results.get(item.key);
    if (done) return done;
    const added = manual.get(item.key);
    if (added) {
      return {
        key: item.key,
        label: item.title,
        status: known.has(item.key) ? "updated" : "imported",
        manual: true,
        message: known.has(item.key) ? "Toujours absent d'IGDB : reste ajouté à la main." : "Absent d'IGDB : ajouté à la main.",
        ficheId: added.ficheId,
        entryId: entryIds.get(mediaIds.get(item.key)!),
        gameCandidates: added.candidates,
      };
    }
    const near = linkedTo.get(item.key);
    return {
      key: item.key,
      label: item.title,
      status: known.has(item.key) ? "updated" : "imported",
      ...(near ? { message: near } : {}),
    };
  });
}
