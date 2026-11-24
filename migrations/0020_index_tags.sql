-- Lignes du journal qui portent un tag (une petite partie du journal) : les menus et suggestions de tags ne lisent
-- plus tout le journal. Index partiel : seules ces lignes y figurent. La création lit une fois progress_log.
CREATE INDEX IF NOT EXISTS idx_progress_tags ON progress_log (entry_id) WHERE tags_json IS NOT NULL;
