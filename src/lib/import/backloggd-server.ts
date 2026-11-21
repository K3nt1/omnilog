// Import Backloggd côté serveur : un paquet de jeux en 1 requête IGDB et 3 lots D1.
// Backloggd reprend les slugs d'IGDB (sa page de jeu renvoie vers igdb.com/games/<slug>) : la correspondance est sûre.
import { CURRENT_USER_ID, findImportLinks, upsertMediaStatement } from "../library";
import { SourceError } from "../sources/http";
import { getIgdbGamesBySlugs } from "../sources/igdb";
import { storedStatus, type MediaDetails } from "../types";
import type { BackloggdGame, ImportItemResult } from "./types";

const normalize = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

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
  const mediaIds = new Map<string, number>();
  for (const item of items) {
    const link = known.get(item.key);
    if (link) mediaIds.set(item.key, link.mediaId);
  }

  // Jeux pas encore reconnus : une seule requête IGDB par slug, et par identifiant Backloggd en secours.
  const unknown = items.filter((i) => !mediaIds.has(i.key));
  if (unknown.length > 0) {
    let lookup: Awaited<ReturnType<typeof getIgdbGamesBySlugs>>;
    try {
      lookup = await getIgdbGamesBySlugs(
        env,
        unknown.map((i) => i.slug),
        unknown.flatMap((i) => (i.gameId ? [i.gameId] : [])),
      );
    } catch (error) {
      const message = error instanceof SourceError || error instanceof Error ? error.message : "IGDB ne répond pas";
      for (const i of unknown) results.set(i.key, { key: i.key, label: i.title, status: "error", message });
      lookup = { bySlug: new Map(), byId: new Map() };
    }
    const matched: { item: BackloggdGame; details: MediaDetails }[] = [];
    for (const item of unknown) {
      if (results.has(item.key)) continue;
      const byId = item.gameId ? lookup.byId.get(String(item.gameId)) : undefined;
      // L'identifiant Backloggd n'est retenu que s'il désigne bien le même jeu chez IGDB.
      const details = lookup.bySlug.get(item.slug) ?? (byId && normalize(byId.title) === normalize(item.title) ? byId : undefined);
      if (details) matched.push({ item, details });
      else results.set(item.key, { key: item.key, label: item.title, status: "not_found", message: "Introuvable chez IGDB : ajoute-le via la recherche." });
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
  if (mediaIds.size > 0) {
    // Nouvelles œuvres : les nouveautés lentes (DLC) les vérifieront dès la prochaine exécution programmée.
    await db.prepare("UPDATE users SET news_next_check_at = NULL WHERE id = ?").bind(CURRENT_USER_ID).run();
  }
  return items.map(
    (item) =>
      results.get(item.key) ?? { key: item.key, label: item.title, status: known.has(item.key) ? "updated" : "imported" },
  );
}
