// Versions des données (migration 0019) : des compteurs tenus à jour par des triggers. Un résultat coûteux
// gardé dans source_cache sous une clé qui contient la version reste bon tant qu'elle ne change pas :
// une seule ligne lue au lieu de relire la bibliothèque ou le journal.
import { CURRENT_USER_ID } from "./library";
import { cached } from "./source-cache";

export interface DataVersions {
  /** Œuvre ajoutée ou retirée. */
  catalog: number;
  /** Statut, favori, note, critique, dates ou suivi d'une œuvre modifiés (pas les avancées de position). */
  library: number;
  /** Journal : ligne ajoutée, retirée ou redatée. */
  journal: number;
  /** Tags du journal. */
  tags: number;
}

export async function getVersions(db: D1Database): Promise<DataVersions> {
  const row = await db
    .prepare("SELECT catalog_version AS catalog, library_version AS library, journal_version AS journal, tags_version AS tags FROM users WHERE id = ?")
    .bind(CURRENT_USER_ID)
    .first<DataVersions>();
  return row ?? { catalog: 0, library: 0, journal: 0, tags: 0 };
}

/** Durée de vie des résultats versionnés : la version suffit, la durée ne sert qu'au ménage (7 jours). */
const VERSIONED_TTL = 6 * 86400_000;

/**
 * Résultat gardé sous `key` + les versions dont il dépend. `ttlMs` borne quand même sa durée de vie
 * (utile pour ce qui dépend aussi de la date, ou d'une donnée sans version).
 */
export function cachedVersioned<T>(db: D1Database, key: string, versions: (number | string)[], load: () => Promise<T>, ttlMs = VERSIONED_TTL): Promise<T> {
  return cached(db, `v:${key}:${versions.join(".")}`, ttlMs, load);
}
