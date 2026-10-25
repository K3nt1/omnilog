-- Migration 0008 : visionnage sans date.
-- Comme sur Letterboxd, on peut ajouter un visionnage sans préciser quand on a vu l'œuvre :
-- logged_at garde alors le jour de l'ajout, et undated = 1 indique que ce n'est pas la date de visionnage.
-- (Ajouter une colonne ne demande pas de reconstruire la table : aucune réécriture.)

ALTER TABLE progress_log ADD COLUMN undated INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1));
