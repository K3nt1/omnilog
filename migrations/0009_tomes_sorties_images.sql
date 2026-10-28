-- Migration 0009 : tomes de manga, prochaines sorties, cadrage de l'image de fond (v0.6.0).
--
-- 1. library_entries.current_volume : tome en cours d'un manga (comme current_chapter, le prochain à lire).
-- 2. progress_log reconstruite (SQLite ne sait pas modifier une contrainte CHECK) :
--    - nouveau type 'volume' : un tome entier lu (« +1 tome », « Tome 12 lu ») ;
--    - colonne volume : le numéro de ce tome.
--    Les autres colonnes, l'annulation et « sans date » sont recopiées telles quelles.
-- 3. media.release_json : prochain épisode annoncé (séries, anime) ou dernier chapitre paru (mangas),
--    rafraîchi à chaque visite de la fiche d'une œuvre en diffusion.
-- 4. library_entries.backdrop_position : cadrage choisi pour l'image de fond (« 50% 30% », position CSS).
--
-- Écritures : une par ligne du journal (copie), une seule fois. Aucune table ne dépend de progress_log.

ALTER TABLE library_entries ADD COLUMN current_volume INTEGER CHECK (current_volume >= 1);
ALTER TABLE library_entries ADD COLUMN backdrop_position TEXT;
ALTER TABLE media ADD COLUMN release_json TEXT CHECK (release_json IS NULL OR json_valid(release_json));

CREATE TABLE progress_log_new (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('episode', 'chapter', 'volume', 'movie', 'session', 'pause', 'complete')),
  season            INTEGER,
  episode           INTEGER,
  chapter           REAL,
  volume            INTEGER,
  pause_seconds     INTEGER,
  pause_page        INTEGER,
  duration_minutes  INTEGER,
  note              TEXT,
  logged_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10),
  review            TEXT,
  tags_json         TEXT CHECK (tags_json IS NULL OR (json_valid(tags_json) AND json_type(tags_json) = 'array')),
  external_ref      TEXT,
  undo_json         TEXT CHECK (undo_json IS NULL OR json_valid(undo_json)),
  undated           INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1))
);

INSERT INTO progress_log_new (id, entry_id, kind, season, episode, chapter, pause_seconds, pause_page,
                              duration_minutes, note, logged_at, rating, review, tags_json, external_ref,
                              undo_json, undated)
SELECT id, entry_id, kind, season, episode, chapter, pause_seconds, pause_page,
       duration_minutes, note, logged_at, rating, review, tags_json, external_ref,
       undo_json, undated
FROM progress_log;

DROP TABLE progress_log;
ALTER TABLE progress_log_new RENAME TO progress_log;

CREATE INDEX idx_progress_entry_date ON progress_log (entry_id, logged_at);
CREATE UNIQUE INDEX uq_progress_external_ref ON progress_log (external_ref) WHERE external_ref IS NOT NULL;
