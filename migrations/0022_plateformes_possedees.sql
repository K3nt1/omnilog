-- Où l'on possède un jeu : une ligne par plateforme possédée.
--   format = 'physical' (boîte, cartouche), 'digital' (dématérialisé) ou 'emulated' (émulateur) ;
--   store : PC, launcher (steam, epic, gog…) ; subscription : jeu obtenu par un abonnement (game_pass, ps_plus…) ;
--   émulation : platform = console émulée, device = appareil (PC, Steam Deck, Recalbox…), emulator = son nom.
-- Une plateforme où le jeu n'est pas sorti est permise (portage, rétrocompatibilité…).
-- Coût : une table vide, deux index ; aucune ligne existante lue ni réécrite.

CREATE TABLE game_ownership (
  id            INTEGER PRIMARY KEY,
  entry_id      INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('physical', 'digital', 'emulated')),
  store         TEXT,
  subscription  TEXT,
  device        TEXT,
  emulator      TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Pas deux fois la même possession (même plateforme, même format, même launcher / appareil) ; sert aussi au filtre.
CREATE UNIQUE INDEX idx_ownership_unique ON game_ownership (entry_id, platform, format, COALESCE(store, ''), COALESCE(device, ''));

-- Filtre « Possédé sur » et tirage au sort : les listes gardées en cache sont invalidées (migration 0019).
CREATE TRIGGER trg_version_ownership_insert AFTER INSERT ON game_ownership
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;

CREATE TRIGGER trg_version_ownership_delete AFTER DELETE ON game_ownership
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = OLD.entry_id);
END;

CREATE TRIGGER trg_version_ownership_update AFTER UPDATE ON game_ownership
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;
