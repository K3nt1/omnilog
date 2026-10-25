-- Migration 0007 : le focus dans sa propre table.
--
-- Avant, le focus était library_entries.is_focus, avec la contrainte « seule une œuvre en cours peut
-- être le focus ». Désormais un film peut être le focus sans être commencé (tiré au sort, choisi pour
-- ce soir) ; il passe « en cours » seulement quand on y met une pause. Modifier la contrainte demanderait
-- de reconstruire library_entries (et SQLite supprimerait en cascade le journal) : le focus vit donc ici.
-- library_entries.is_focus n'est plus utilisée (toujours 0).

CREATE TABLE focus (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'anime', 'manga', 'game')),
  entry_id   INTEGER NOT NULL UNIQUE REFERENCES library_entries (id) ON DELETE CASCADE,
  since      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, media_type)                -- un seul focus par type
) WITHOUT ROWID;

INSERT INTO focus (user_id, media_type, entry_id)
SELECT user_id, media_type, id FROM library_entries WHERE is_focus = 1;

UPDATE library_entries SET is_focus = 0 WHERE is_focus = 1;

-- Œuvres tirées au sort avec l'ancienne règle (passées « en cours » sans avoir été commencées) :
-- elles retournent dans la watchlist / le backlog, en gardant le focus.
UPDATE library_entries SET status = 'planned'
WHERE drawn_at IS NOT NULL AND status = 'in_progress'
  AND NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = library_entries.id AND p.undo_json IS NOT NULL);
