-- Migration number: 0003 	 2026-10-17T17:54:19.801Z
-- =====================================================================
-- Migration 0003 : liens externes, affiches personnalisées, pays de visionnage
-- (ALTER TABLE uniquement : aucune donnée existante n'est touchée)
-- =====================================================================


-- ---------------------------------------------------------------------
-- users.watch_region : pays utilisé pour "où regarder" (TMDB / JustWatch).
-- Code pays ISO 3166-1 alpha-2 en majuscules : 'CY' (Chypre), 'FR' (France)…
-- Modifiable dans les paramètres ; l'offre de streaming change selon le pays.
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN watch_region TEXT NOT NULL DEFAULT 'FR'
  CHECK (length(watch_region) = 2 AND watch_region = upper(watch_region));

UPDATE users SET watch_region = 'CY' WHERE id = 1;


-- ---------------------------------------------------------------------
-- media.external_links_json : liens vers les sites officiels quand ils ne
-- peuvent pas être déduits des IDs, ou pour corriger un lien calculé.
-- Format : objet JSON, une clé par site. Exemples :
--   {"letterboxd": "https://boxd.it/2bg8"}            (fourni par l'export Letterboxd)
--   {"backloggd": "https://backloggd.com/games/hades/"}
-- Les liens absents sont calculés à partir de source + external_id :
--   letterboxd.com/tmdb/<id>, myanimelist.net/anime/<id>, etc.
-- ---------------------------------------------------------------------
ALTER TABLE media
  ADD COLUMN external_links_json TEXT
  CHECK (external_links_json IS NULL OR (json_valid(external_links_json) AND json_type(external_links_json) = 'object'));


-- ---------------------------------------------------------------------
-- library_entries.custom_* : TES images, qui remplacent celles de TMDB /
-- IGDB / MAL dans l'interface. Null = image d'origine.
-- Acceptées : une URL https://… (image collée) ou un chemin /… (futur upload
-- stocké sur Cloudflare R2 et servi par l'application).
-- ---------------------------------------------------------------------
ALTER TABLE library_entries
  ADD COLUMN custom_poster_url TEXT
  CHECK (custom_poster_url IS NULL OR custom_poster_url LIKE 'https://%' OR custom_poster_url LIKE '/%');

ALTER TABLE library_entries
  ADD COLUMN custom_backdrop_url TEXT
  CHECK (custom_backdrop_url IS NULL OR custom_backdrop_url LIKE 'https://%' OR custom_backdrop_url LIKE '/%');