// Plateformes possédées (migration 0022) : lecture pour la fiche, enregistrement, saisie en masse, filtre et tirage.
import { cachedVersioned, type DataVersions } from "./data-version";
import { CURRENT_USER_ID } from "./library";
import { ownedKeyLabel, ownedKeys, sameOwnership, type Ownership } from "./ownership-shared";

export interface OwnershipRow {
  platform: string;
  format: Ownership["format"];
  store: string | null;
  subscription: string | null;
  device: string | null;
  emulator: string | null;
}

export const toOwnership = (r: OwnershipRow): Ownership => ({
  platform: r.platform,
  format: r.format,
  store: r.store,
  subscription: r.subscription,
  device: r.device,
  emulator: r.emulator,
});

const COLUMNS = "o.platform, o.format, o.store, o.subscription, o.device, o.emulator";

/** Possessions d'un jeu de ta bibliothèque (requête à mettre dans le lot de la fiche). */
export function ownershipStatement(db: D1Database, source: string, externalId: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM game_ownership o
       JOIN library_entries l ON l.id = o.entry_id JOIN media m ON m.id = l.media_id
       WHERE l.user_id = ? AND m.type = 'game' AND m.source = ? AND m.external_id = ?
       ORDER BY o.platform, o.format, o.store`,
    )
    .bind(CURRENT_USER_ID, source, externalId);
}

const insertSql = `INSERT OR IGNORE INTO game_ownership (entry_id, platform, format, store, subscription, device, emulator)`;

/** Sans doublon (même plateforme, format, launcher, appareil) : la dernière saisie l'emporte. */
function dedupe(list: Ownership[]): Ownership[] {
  const out: Ownership[] = [];
  for (const o of list) {
    const i = out.findIndex((x) => sameOwnership(x, o));
    if (i >= 0) out[i] = o;
    else out.push(o);
  }
  return out;
}

/** Remplace les possessions d'un jeu de ta bibliothèque. false si l'entrée n'est pas un de tes jeux. */
export async function setOwnership(db: D1Database, entryId: number, list: Ownership[]): Promise<boolean> {
  const entry = await db
    .prepare("SELECT id FROM library_entries WHERE id = ? AND user_id = ? AND media_type = 'game'")
    .bind(entryId, CURRENT_USER_ID)
    .first<{ id: number }>();
  if (!entry) return false;
  const insert = db.prepare(`${insertSql} VALUES (?, ?, ?, ?, ?, ?, ?)`);
  await db.batch([
    db.prepare("DELETE FROM game_ownership WHERE entry_id = ?").bind(entryId),
    ...dedupe(list).map((o) => insert.bind(entryId, o.platform, o.format, o.store, o.subscription, o.device, o.emulator)),
  ]);
  return true;
}

/** Saisie en masse : ajoute cette possession à ces jeux (les tiens seulement ; déjà là : rien ne change). */
export async function addOwnershipToMany(db: D1Database, entryIds: number[], o: Ownership): Promise<number> {
  const result = await db
    .prepare(
      `${insertSql}
       SELECT l.id, ?, ?, ?, ?, ?, ? FROM library_entries l
       WHERE l.id IN (SELECT value FROM json_each(?)) AND l.user_id = ? AND l.media_type = 'game'`,
    )
    .bind(o.platform, o.format, o.store, o.subscription, o.device, o.emulator, JSON.stringify(entryIds), CURRENT_USER_ID)
    .run();
  return result.meta.changes;
}

/** Saisie en masse : retire cette plateforme (tous formats) de ces jeux. */
export async function removePlatformFromMany(db: D1Database, entryIds: number[], platform: string): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM game_ownership WHERE platform = ?
         AND entry_id IN (SELECT l.id FROM library_entries l WHERE l.id IN (SELECT value FROM json_each(?)) AND l.user_id = ?)`,
    )
    .bind(platform, JSON.stringify(entryIds), CURRENT_USER_ID)
    .run();
  return result.meta.changes;
}

/** Condition SQL « possédé sur » pour une valeur de filtre (voir ownedKeys), sur l'entrée `l`. */
export function ownedCondition(key: string): { sql: string; params: string[] } {
  const exists = (where: string) => `EXISTS (SELECT 1 FROM game_ownership o WHERE o.entry_id = l.id AND ${where})`;
  if (key === "e") return { sql: exists("o.format = 'emulated'"), params: [] };
  const value = key.slice(2);
  if (key.startsWith("s:")) return { sql: exists("o.store = ?"), params: [value] };
  if (key.startsWith("a:")) return { sql: exists("o.subscription = ?"), params: [value] };
  return { sql: exists("o.platform = ?"), params: [value] };
}

export interface OwnedFacet {
  value: string;
  label: string;
  count: number;
}

/**
 * Valeurs du filtre « Possédé sur » (et du tirage) avec le nombre de jeux : plateformes, launchers, abonnements, émulé.
 * Gardées jusqu'au prochain changement de bibliothèque. `status` : seulement les jeux de ce statut (tirage : backlog).
 */
export async function getOwnedFacets(db: D1Database, versions: DataVersions): Promise<OwnedFacet[]> {
  return cachedVersioned(db, "lib:possede", [versions.library], async () => {
    const { results } = await db
      .prepare(
        `SELECT o.entry_id, ${COLUMNS} FROM game_ownership o JOIN library_entries l ON l.id = o.entry_id
         WHERE l.user_id = ?`,
      )
      .bind(CURRENT_USER_ID)
      .all<OwnershipRow & { entry_id: number }>();
    const entries = new Map<string, Set<number>>();
    for (const r of results) {
      for (const key of ownedKeys(toOwnership(r))) {
        const set = entries.get(key) ?? new Set<number>();
        set.add(r.entry_id);
        entries.set(key, set);
      }
    }
    const order = (key: string) => (key.startsWith("p:") ? 0 : key.startsWith("s:") ? 1 : key.startsWith("a:") ? 2 : 3);
    return [...entries.entries()]
      .map(([value, set]) => ({ value, label: ownedKeyLabel(value), count: set.size }))
      .sort((a, b) => order(a.value) - order(b.value) || b.count - a.count || a.label.localeCompare(b.label));
  });
}
