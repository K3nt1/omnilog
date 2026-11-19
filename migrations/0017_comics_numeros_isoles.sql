-- Comics (v0.9) : une série peut être « suivie » (position, prochain numéro, sorties) ou en « numéros isolés »
-- (numéros achetés au détail ou repris dans un recueil) : « Lu (numéros isolés) » dès un numéro lu.
-- Les entrées existantes restent suivies (réglage à la main) ; un comic ajouté ensuite part en numéros isolés.
ALTER TABLE library_entries ADD COLUMN follows_series INTEGER NOT NULL DEFAULT 1 CHECK (follows_series IN (0, 1));
