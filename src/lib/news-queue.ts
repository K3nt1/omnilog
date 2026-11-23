// File d'attente des vérifications lentes des nouveautés (voir checkDueNews dans news.ts), gardée dans source_cache.

export const NEWS_QUEUE_KEY = "news:file";

/** Requête qui vide la file : elle sera reconstruite à la prochaine exécution programmée (œuvre ajoutée, réglage). */
export const resetNewsQueue = (db: D1Database) => db.prepare("DELETE FROM source_cache WHERE key = ?").bind(NEWS_QUEUE_KEY);
