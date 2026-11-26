// Cache des réponses de sources externes dans D1 (table source_cache), pour ménager leurs limites
// de requêtes. Best effort : une erreur de cache ne bloque jamais la requête à la source.

/**
 * Réponse gardée si elle a moins de `ttlMs` ; sinon `load()` est appelé et son résultat gardé.
 * `ttlMs` peut dépendre de la réponse gardée (ex. une page d'anciens numéros reste valable plus longtemps).
 */
export async function cached<T>(
  db: D1Database | undefined,
  key: string,
  ttlMs: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> {
  if (db) {
    try {
      const row = await db.prepare("SELECT body, fetched_at FROM source_cache WHERE key = ?").bind(key).first<{ body: string; fetched_at: string }>();
      if (row) {
        const value = JSON.parse(row.body) as T;
        const ttl = typeof ttlMs === "function" ? ttlMs(value) : ttlMs;
        if (Date.now() - Date.parse(row.fetched_at) < ttl) return value;
      }
    } catch (error) {
      console.error("Cache illisible", key, error);
    }
  }
  const value = await load();
  if (db) {
    try {
      await db
        .prepare("INSERT INTO source_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
        .bind(key, JSON.stringify(value), new Date().toISOString())
        .run();
    } catch (error) {
      console.error("Cache non enregistré", key, error);
    }
  }
  return value;
}

/** Ménage : réponses de plus de `days` jours. */
export async function pruneSourceCache(db: D1Database, days = 7, now = Date.now()): Promise<void> {
  await db.prepare("DELETE FROM source_cache WHERE fetched_at < ?").bind(new Date(now - days * 86400_000).toISOString()).run();
}
