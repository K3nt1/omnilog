-- Migration 0012 : interrupteur « Inclure le contenu pour adultes dans la recherche » (Réglages).
-- MyAnimeList écarte par défaut les œuvres classées pour adultes de sa recherche ; activé, Omnilog les demande
-- aussi (paramètre nsfw=true). Désactivé par défaut. Une seule colonne ajoutée, aucune ligne réécrite.
ALTER TABLE users ADD COLUMN search_adult INTEGER NOT NULL DEFAULT 0 CHECK (search_adult IN (0, 1));
