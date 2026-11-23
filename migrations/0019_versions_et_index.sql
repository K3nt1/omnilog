-- Moins de lignes lues (plan gratuit : 5 millions par jour).
--
-- 1. Versions des données. Des compteurs dans users, tenus à jour par des triggers, disent si un résultat gardé
--    en cache (source_cache) est encore bon, sans relire la bibliothèque :
--    - catalog_version : une œuvre ajoutée ou retirée (genres, années, plateformes des filtres) ;
--    - library_version : un changement visible dans les listes (statut, favori, note, critique, dates, type,
--      focus, tirage, affiche) ;
--      les avancées de position (épisode, chapitre…) n'en font pas partie ;
--    - journal_version : une ligne du journal ajoutée, retirée ou redatée ;
--    - tags_version : un tag du journal ajouté, modifié ou retiré.
-- 2. Index pour les requêtes qui relisaient toute la bibliothèque ou toute la table media.
-- Coût : aucune ligne réécrite ; la création des index lit une fois media et library_entries.

ALTER TABLE users ADD COLUMN catalog_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN library_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN journal_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN tags_version INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER trg_version_library_insert AFTER INSERT ON library_entries
BEGIN
  UPDATE users SET catalog_version = catalog_version + 1, library_version = library_version + 1 WHERE id = NEW.user_id;
END;

CREATE TRIGGER trg_version_library_delete AFTER DELETE ON library_entries
BEGIN
  UPDATE users SET catalog_version = catalog_version + 1, library_version = library_version + 1 WHERE id = OLD.user_id;
END;

CREATE TRIGGER trg_version_library_update
AFTER UPDATE OF media_id, media_type, status, substatus, is_favorite, rating, review, completed_at, created_at, follows_series, mastered,
  drawn_at, custom_poster_url, custom_backdrop_url
ON library_entries
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = NEW.user_id;
END;

CREATE TRIGGER trg_version_journal_insert AFTER INSERT ON progress_log
BEGIN
  UPDATE users SET journal_version = journal_version + 1,
                   tags_version = tags_version + (NEW.tags_json IS NOT NULL)
  WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;

CREATE TRIGGER trg_version_journal_delete AFTER DELETE ON progress_log
BEGIN
  UPDATE users SET journal_version = journal_version + 1,
                   tags_version = tags_version + (OLD.tags_json IS NOT NULL)
  WHERE id = (SELECT user_id FROM library_entries WHERE id = OLD.entry_id);
END;

CREATE TRIGGER trg_version_journal_update AFTER UPDATE OF logged_at, kind, undated, rating, review, tags_json ON progress_log
BEGIN
  UPDATE users SET journal_version = journal_version + 1,
                   tags_version = tags_version + (NEW.tags_json IS NOT OLD.tags_json)
  WHERE id = (SELECT user_id FROM library_entries WHERE id = NEW.entry_id);
END;

-- Compteurs par type et par statut (page d'un type, backlog, filtres) sans lire les lignes de la table.
CREATE INDEX IF NOT EXISTS idx_library_user_type_status ON library_entries (user_id, media_type, list_status);
-- Séries, animes, mangas et comics en cours de diffusion (vérification des sorties, page Aujourd'hui).
CREATE INDEX IF NOT EXISTS idx_media_ongoing ON media (release_checked_at) WHERE is_ongoing = 1;
-- Prochain épisode / numéro annoncé (sorties du calendrier).
CREATE INDEX IF NOT EXISTS idx_media_next_release ON media (json_extract(release_json, '$.at'))
  WHERE json_extract(release_json, '$.kind') = 'next';
-- Date de sortie (films et jeux attendus dans le calendrier, dates à rafraîchir).
CREATE INDEX IF NOT EXISTS idx_media_release_date ON media (release_date) WHERE release_date IS NOT NULL;

-- Focus (page Aujourd'hui, pages des types) : mettre ou retirer une œuvre du focus change aussi les listes.
CREATE TRIGGER trg_version_focus_insert AFTER INSERT ON focus
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = NEW.user_id;
END;

CREATE TRIGGER trg_version_focus_delete AFTER DELETE ON focus
BEGIN
  UPDATE users SET library_version = library_version + 1 WHERE id = OLD.user_id;
END;
