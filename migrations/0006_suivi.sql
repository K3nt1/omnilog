-- Migration 0006 : le suivi (v0.5.0).
--
-- 1. progress_log reconstruite (SQLite ne sait pas modifier une contrainte CHECK) :
--    - nouveau type 'complete' : œuvre terminée ou refaite en entier (série, animé, manga, jeu),
--      pour compter les revisionnages, relectures et parties ('movie' reste le visionnage d'un film) ;
--    - undo_json : état de l'entrée juste avant cette progression, pour « Annuler la dernière progression ».
-- 2. library_entries.drawn_at : œuvre tirée au sort (et devenue le focus) ; vidé dès qu'on progresse
--    dessus. « Relancer » remet l'œuvre tirée précédente dans la watchlist / le backlog.
--
-- Écritures : une par visionnage existant (copie), une seule fois.

CREATE TABLE progress_log_new (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('episode', 'chapter', 'movie', 'session', 'pause', 'complete')),
  season            INTEGER,
  episode           INTEGER,
  chapter           REAL,
  pause_seconds     INTEGER,
  pause_page        INTEGER,
  duration_minutes  INTEGER,
  note              TEXT,
  logged_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10),
  review            TEXT,
  tags_json         TEXT CHECK (tags_json IS NULL OR (json_valid(tags_json) AND json_type(tags_json) = 'array')),
  external_ref      TEXT,
  undo_json         TEXT CHECK (undo_json IS NULL OR json_valid(undo_json))
);

INSERT INTO progress_log_new (id, entry_id, kind, season, episode, chapter, pause_seconds, pause_page,
                              duration_minutes, note, logged_at, rating, review, tags_json, external_ref)
SELECT id, entry_id, kind, season, episode, chapter, pause_seconds, pause_page,
       duration_minutes, note, logged_at, rating, review, tags_json, external_ref
FROM progress_log;

DROP TABLE progress_log;
ALTER TABLE progress_log_new RENAME TO progress_log;

CREATE INDEX idx_progress_entry_date ON progress_log (entry_id, logged_at);
CREATE UNIQUE INDEX uq_progress_external_ref ON progress_log (external_ref) WHERE external_ref IS NOT NULL;

ALTER TABLE library_entries ADD COLUMN drawn_at TEXT;
