-- Note et critique d'une saison de série. Une saison peut en avoir plusieurs (revisionnages), comme un film.
-- Table à part plutôt qu'un nouveau type de ligne du journal : la contrainte sur progress_log.kind obligerait à
-- reconstruire toute la table. La note de la série reste indépendante de celles des saisons.
-- undated = 1 : « sans date », logged_at est alors le jour de l'ajout (comme pour le journal).
-- Coût : une table vide et un index ; aucune ligne existante lue ni réécrite.

CREATE TABLE season_reviews (
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  season      INTEGER NOT NULL CHECK (season >= 1),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 10),
  review      TEXT,
  logged_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undated     INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_season_reviews_entry ON season_reviews (entry_id, season);

-- Le journal et le bilan les affichent : chaque changement invalide leurs résultats gardés en cache (migration 0019).
CREATE TRIGGER trg_version_season_review_insert AFTER INSERT ON season_reviews
BEGIN
  UPDATE users SET journal_version = journal_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;

CREATE TRIGGER trg_version_season_review_delete AFTER DELETE ON season_reviews
BEGIN
  UPDATE users SET journal_version = journal_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = OLD.entry_id);
END;

CREATE TRIGGER trg_version_season_review_update AFTER UPDATE OF season, rating, review, logged_at, undated ON season_reviews
BEGIN
  UPDATE users SET journal_version = journal_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;
