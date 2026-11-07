-- Migration 0011 : nouveautés (v0.7.0, partie 2).
--
-- 1. news : le fil des nouveautés sur ce que tu suis. Une ligne par nouveauté, sans doublon (dedupe_key) :
--    episode (nouvel épisode disponible), season (nouvelle saison d'une série), sequel (suite d'un anime),
--    chapter (nouveau chapitre), dlc (DLC ou extension d'un jeu), provider (film de la watchlist arrivé
--    sur une plateforme). seen_at : vue (bouton « Vu » ou « Tout marquer comme vu »).
-- 2. media.news_state_json : ce qui était connu à la dernière vérification (saisons, suites, DLC, plateformes),
--    pour ne signaler que ce qui change. La première vérification note l'état sans rien signaler.
--    media.news_checked_at : vérifications lentes (plateformes tous les 3 jours, saisons et DLC chaque
--    semaine, suites d'anime chaque mois), les moins récentes d'abord.
-- 3. users.news_kinds : types de nouveautés suivis (masque : épisode 1, saison 2, chapitre 4, DLC 8,
--    plateforme 16, suite d'anime 32 ; 63 = tout).
--
-- Écritures : aucune ligne existante modifiée (deux tables touchées par ADD COLUMN, une table vide créée).

CREATE TABLE news (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_id     INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('episode', 'season', 'sequel', 'chapter', 'dlc', 'provider')),
  label        TEXT NOT NULL,
  detail       TEXT,
  url          TEXT,
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  seen_at      TEXT
);

CREATE INDEX idx_news_user_date ON news (user_id, created_at);

ALTER TABLE media ADD COLUMN news_state_json TEXT CHECK (news_state_json IS NULL OR json_valid(news_state_json));
ALTER TABLE media ADD COLUMN news_checked_at TEXT;
ALTER TABLE users ADD COLUMN news_kinds INTEGER NOT NULL DEFAULT 63 CHECK (news_kinds BETWEEN 0 AND 63);
