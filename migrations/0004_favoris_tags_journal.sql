-- =====================================================================
-- Migration 0004 : favoris, détail des visionnages (journal), lien Letterboxd indexé
-- Préparée pour l'import Letterboxd / MyAnimeList. Uniquement des ajouts.
-- =====================================================================


-- ---------------------------------------------------------------------
-- library_entries.is_favorite : œuvre "likée" ♥ (Letterboxd) / favorite.
-- ---------------------------------------------------------------------
ALTER TABLE library_entries
  ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));


-- ---------------------------------------------------------------------
-- progress_log : chaque visionnage peut porter sa propre note, sa critique
-- et ses tags (un revisionnage peut avoir une note différente de la première fois).
-- library_entries.rating / review gardent la note et la critique "actuelles".
-- ---------------------------------------------------------------------
ALTER TABLE progress_log
  ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 10);

ALTER TABLE progress_log
  ADD COLUMN review TEXT;

-- Tags libres, tableau JSON : ["streaming", "vf", "2025", "🇺🇸"]
ALTER TABLE progress_log
  ADD COLUMN tags_json TEXT
  CHECK (tags_json IS NULL OR (json_valid(tags_json) AND json_type(tags_json) = 'array'));

-- Identifiant de l'entrée d'origine (ex. lien boxd.it d'une entrée de journal) :
-- relancer un import n'insère jamais deux fois le même visionnage.
ALTER TABLE progress_log
  ADD COLUMN external_ref TEXT;

CREATE UNIQUE INDEX uq_progress_external_ref
  ON progress_log (external_ref)
  WHERE external_ref IS NOT NULL;


-- ---------------------------------------------------------------------
-- Index sur le lien Letterboxd d'une œuvre : à la reprise d'un import, les films
-- déjà reconnus sont retrouvés instantanément, sans nouvelle recherche TMDB.
-- ---------------------------------------------------------------------
CREATE INDEX idx_media_letterboxd
  ON media (json_extract(external_links_json, '$.letterboxd'));
