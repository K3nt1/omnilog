-- 0.8.1 : moins de lignes lues sur D1 (plan gratuit : 5 millions par jour).
--
-- 1. Index sur les colonnes qui pointent vers une autre table. Sans eux, supprimer une œuvre ou une entrée
--    oblige SQLite à parcourir toutes les tables qui la référencent : la migration 0013 a lu ainsi
--    près de 30 millions de lignes en supprimant l'ancienne table media.
CREATE INDEX IF NOT EXISTS idx_library_media ON library_entries (media_id);
CREATE INDEX IF NOT EXISTS idx_import_links_media_id ON import_links (media_id);
CREATE INDEX IF NOT EXISTS idx_news_entry ON news (entry_id);
CREATE INDEX IF NOT EXISTS idx_reminders_entry ON reminders (entry_id);
CREATE INDEX IF NOT EXISTS idx_reminder_events_entry ON reminder_events (entry_id);
CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder ON reminder_events (reminder_id);

-- 2. Nouveautés lentes (plateformes, saisons, suites, DLC) : quand une vérification ne trouve plus rien à faire,
--    la suivante attend quelques heures au lieu de relire toute la bibliothèque tous les quarts d'heure.
ALTER TABLE users ADD COLUMN news_next_check_at TEXT;

-- 3. Réponses de Comic Vine gardées quelques heures (recherches, séries, numéros) :
--    Comic Vine limite à 200 requêtes par heure et bloque les rafales.
CREATE TABLE source_cache (
  key        TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
