-- Calendrier (v0.9) : les vues Mois et Année cherchent les activités par date.
-- Sans ces index, chaque affichage parcourrait tout le journal et toute la bibliothèque.
CREATE INDEX IF NOT EXISTS idx_progress_logged_at ON progress_log (logged_at);
CREATE INDEX IF NOT EXISTS idx_library_created_at ON library_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_library_completed_at ON library_entries (completed_at);
