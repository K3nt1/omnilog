-- Tri par défaut de la bibliothèque et de chaque page de type (Réglages).
-- JSON : { "all": { "sort": "titre", "direction": "asc" }, "movie": { … }, … } ; absent = « Dernière activité ».
ALTER TABLE users ADD COLUMN default_sorts_json TEXT;
