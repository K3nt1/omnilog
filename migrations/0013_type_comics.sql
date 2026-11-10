-- Migration 0013 : nouveau type « comic » (v0.8.0) ; les types et sources ne sont plus figés dans la base.
--
-- Les types autorisés étaient figés par des contraintes CHECK dans media, library_entries et focus (et les sources
-- dans media et import_links). SQLite ne sait pas modifier une contrainte : il faut reconstruire ces tables.
-- Le code vérifie déjà les types et les sources : les contraintes sont retirées, un futur type n'aura plus
-- besoin de reconstruction.
--
-- Le piège : D1 ne permet pas de couper les clés étrangères pendant une migration. Supprimer l'ancienne table
-- media ou library_entries déclencherait les « ON DELETE CASCADE » et viderait le journal, les rappels, le focus…
-- (même avec defer_foreign_keys, qui ne retarde que les vérifications). D'où trois étapes :
--   1. détacher : les tables enfants sont recopiées avec des clés « NO ACTION » (rien ne se supprime en cascade) ;
--   2. reconstruire library_entries puis media, sans contrainte de type ;
--   3. rattacher : les tables enfants sont recopiées avec leurs « ON DELETE CASCADE » d'origine.
-- Les vérifications des clés étrangères sont reportées à la fin de la migration (defer_foreign_keys) : tout doit
-- être cohérent à ce moment-là, sinon la migration entière est annulée et rien n'est modifié.
--
-- Différence volontaire : library_entries → media passe de RESTRICT à NO ACTION (même protection : une œuvre
-- suivie ne peut pas être supprimée), parce qu'une contrainte RESTRICT ne peut pas être reportée.
-- Écritures : chaque ligne des tables concernées est recopiée (deux fois pour les tables enfants), une seule fois.

PRAGMA defer_foreign_keys = ON;

-- ---------- 1. Détacher les tables enfants (NO ACTION) ----------

-- progress_log
CREATE TABLE progress_log_new (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE NO ACTION,
  kind              TEXT NOT NULL CHECK (kind IN ('episode', 'chapter', 'volume', 'movie', 'session', 'pause', 'complete')),
  season            INTEGER,
  episode           INTEGER,
  chapter           REAL,
  volume            INTEGER,
  pause_seconds     INTEGER,
  pause_page        INTEGER,
  duration_minutes  INTEGER,
  note              TEXT,
  logged_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10),
  review            TEXT,
  tags_json         TEXT CHECK (tags_json IS NULL OR (json_valid(tags_json) AND json_type(tags_json) = 'array')),
  external_ref      TEXT,
  undo_json         TEXT CHECK (undo_json IS NULL OR json_valid(undo_json)),
  undated           INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1))
);
INSERT INTO progress_log_new (id, entry_id, kind, season, episode, chapter, volume, pause_seconds, pause_page, duration_minutes, note, logged_at, rating, review, tags_json, external_ref, undo_json, undated)
SELECT id, entry_id, kind, season, episode, chapter, volume, pause_seconds, pause_page, duration_minutes, note, logged_at, rating, review, tags_json, external_ref, undo_json, undated FROM progress_log;
DROP TABLE progress_log;
ALTER TABLE progress_log_new RENAME TO progress_log;
CREATE INDEX idx_progress_entry_date ON progress_log (entry_id, logged_at);
CREATE UNIQUE INDEX uq_progress_external_ref ON progress_log (external_ref) WHERE external_ref IS NOT NULL;

-- reminder_events
CREATE TABLE reminder_events_new (
  id           INTEGER PRIMARY KEY,
  reminder_id  INTEGER NOT NULL REFERENCES reminders (id) ON DELETE NO ACTION,
  entry_id     INTEGER REFERENCES library_entries (id) ON DELETE NO ACTION,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  sent_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at  TEXT
);
INSERT INTO reminder_events_new (id, reminder_id, entry_id, message, status, sent_at, resolved_at)
SELECT id, reminder_id, entry_id, message, status, sent_at, resolved_at FROM reminder_events;
DROP TABLE reminder_events;
ALTER TABLE reminder_events_new RENAME TO reminder_events;
CREATE INDEX idx_events_status_date ON reminder_events (status, sent_at);

-- reminders
CREATE TABLE reminders_new (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('daily_quest', 'media', 'custom')),
  entry_id      INTEGER REFERENCES library_entries (id) ON DELETE NO ACTION,
  label         TEXT,
  days_of_week  INTEGER NOT NULL DEFAULT 127 CHECK (days_of_week BETWEEN 1 AND 127),
  time_of_day   TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_sent_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (kind = 'daily_quest' AND entry_id IS NULL) OR
    (kind = 'media'       AND entry_id IS NOT NULL) OR
    (kind = 'custom'      AND entry_id IS NULL AND label IS NOT NULL)
  )
);
INSERT INTO reminders_new (id, user_id, kind, entry_id, label, days_of_week, time_of_day, is_active, last_sent_at, created_at)
SELECT id, user_id, kind, entry_id, label, days_of_week, time_of_day, is_active, last_sent_at, created_at FROM reminders;
DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX idx_reminders_active ON reminders (is_active, time_of_day);

-- focus
CREATE TABLE focus_new (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  entry_id   INTEGER NOT NULL UNIQUE REFERENCES library_entries (id) ON DELETE NO ACTION,
  since      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, media_type)
) WITHOUT ROWID;
INSERT INTO focus_new (user_id, media_type, entry_id, since)
SELECT user_id, media_type, entry_id, since FROM focus;
DROP TABLE focus;
ALTER TABLE focus_new RENAME TO focus;

-- news
CREATE TABLE news_new (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_id     INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE NO ACTION,
  kind         TEXT NOT NULL CHECK (kind IN ('episode', 'season', 'sequel', 'chapter', 'dlc', 'provider')),
  label        TEXT NOT NULL,
  detail       TEXT,
  url          TEXT,
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  seen_at      TEXT
);
INSERT INTO news_new (id, user_id, entry_id, kind, label, detail, url, dedupe_key, created_at, seen_at)
SELECT id, user_id, entry_id, kind, label, detail, url, dedupe_key, created_at, seen_at FROM news;
DROP TABLE news;
ALTER TABLE news_new RENAME TO news;
CREATE INDEX idx_news_user_date ON news (user_id, created_at);

-- media_seasons
CREATE TABLE media_seasons_new (
  media_id       INTEGER NOT NULL REFERENCES media (id) ON DELETE NO ACTION,
  season_number  INTEGER NOT NULL CHECK (season_number >= 0),
  episode_count  INTEGER NOT NULL CHECK (episode_count >= 0),
  name           TEXT,
  air_date       TEXT,
  PRIMARY KEY (media_id, season_number)
) WITHOUT ROWID;
INSERT INTO media_seasons_new (media_id, season_number, episode_count, name, air_date)
SELECT media_id, season_number, episode_count, name, air_date FROM media_seasons;
DROP TABLE media_seasons;
ALTER TABLE media_seasons_new RENAME TO media_seasons;

-- import_links
CREATE TABLE import_links_new (
  source        TEXT NOT NULL,
  external_key  TEXT NOT NULL,
  media_id      INTEGER NOT NULL REFERENCES media (id) ON DELETE NO ACTION,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source, external_key)
) WITHOUT ROWID;
INSERT INTO import_links_new (source, external_key, media_id, created_at)
SELECT source, external_key, media_id, created_at FROM import_links;
DROP TABLE import_links;
ALTER TABLE import_links_new RENAME TO import_links;
CREATE INDEX idx_import_links_media ON import_links (source, media_id);

-- ---------- 2. Reconstruire library_entries puis media, sans contrainte de type ----------

-- library_entries (ses triggers, qui lisent media, sont recréés après la reconstruction de media)
CREATE TABLE library_entries_new (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_id             INTEGER NOT NULL REFERENCES media (id),   -- pas de suppression d'une œuvre suivie
  media_type           TEXT NOT NULL,                             -- copie de media.type (vérifiée par trigger)
  status               TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'on_hold', 'completed', 'dropped')),
  is_focus             INTEGER NOT NULL DEFAULT 0 CHECK (is_focus IN (0, 1)),
  current_season       INTEGER CHECK (current_season >= 1),
  current_episode      INTEGER CHECK (current_episode >= 1),
  current_chapter      REAL    CHECK (current_chapter >= 0),      -- manga : chapitre ; comic : numéro
  pause_seconds        INTEGER CHECK (pause_seconds >= 0),
  pause_page           INTEGER CHECK (pause_page >= 1),
  game_checkpoint      TEXT,
  sessions_count       INTEGER NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
  playtime_minutes     INTEGER CHECK (playtime_minutes >= 0),
  rating               INTEGER CHECK (rating BETWEEN 1 AND 10),
  review               TEXT,
  started_at           TEXT,
  completed_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  custom_poster_url    TEXT CHECK (custom_poster_url IS NULL OR custom_poster_url LIKE 'https://%' OR custom_poster_url LIKE '/%'),
  custom_backdrop_url  TEXT CHECK (custom_backdrop_url IS NULL OR custom_backdrop_url LIKE 'https://%' OR custom_backdrop_url LIKE '/%'),
  is_favorite          INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  drawn_at             TEXT,
  current_volume       INTEGER CHECK (current_volume >= 1),
  backdrop_position    TEXT,
  UNIQUE (user_id, media_id),
  CHECK (is_focus = 0 OR status = 'in_progress')
);
INSERT INTO library_entries_new (id, user_id, media_id, media_type, status, is_focus, current_season, current_episode, current_chapter, pause_seconds, pause_page, game_checkpoint, sessions_count, playtime_minutes, rating, review, started_at, completed_at, created_at, updated_at, custom_poster_url, custom_backdrop_url, is_favorite, drawn_at, current_volume, backdrop_position)
SELECT id, user_id, media_id, media_type, status, is_focus, current_season, current_episode, current_chapter, pause_seconds, pause_page, game_checkpoint, sessions_count, playtime_minutes, rating, review, started_at, completed_at, created_at, updated_at, custom_poster_url, custom_backdrop_url, is_favorite, drawn_at, current_volume, backdrop_position FROM library_entries;
DROP TABLE library_entries;
ALTER TABLE library_entries_new RENAME TO library_entries;
CREATE UNIQUE INDEX uq_library_one_focus_per_type ON library_entries (user_id, media_type) WHERE is_focus = 1;
CREATE INDEX idx_library_user_status ON library_entries (user_id, status);

-- media
CREATE TABLE media_new (
  id                   INTEGER PRIMARY KEY,
  type                 TEXT NOT NULL,                -- movie, tv, anime, manga, game, comic… (vérifié par le code)
  source               TEXT NOT NULL,                -- tmdb, igdb, mal, comicvine, manual… (vérifié par le code)
  external_id          TEXT,
  title                TEXT NOT NULL,
  original_title       TEXT,
  overview             TEXT,
  poster_url           TEXT,
  backdrop_url         TEXT,
  release_date         TEXT,
  runtime_minutes      INTEGER,
  total_episodes       INTEGER,
  total_chapters       INTEGER,                      -- manga : chapitres ; comic : numéros
  total_volumes        INTEGER,
  is_ongoing           INTEGER NOT NULL DEFAULT 0 CHECK (is_ongoing IN (0, 1)),
  extra_json           TEXT,
  fetched_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  external_links_json  TEXT CHECK (external_links_json IS NULL OR (json_valid(external_links_json) AND json_type(external_links_json) = 'object')),
  search_text          TEXT,
  publisher_fr         TEXT,
  release_json         TEXT CHECK (release_json IS NULL OR json_valid(release_json)),
  release_checked_at   TEXT,
  news_state_json      TEXT CHECK (news_state_json IS NULL OR json_valid(news_state_json)),
  news_checked_at      TEXT,
  UNIQUE (type, source, external_id)
);
INSERT INTO media_new (id, type, source, external_id, title, original_title, overview, poster_url, backdrop_url, release_date, runtime_minutes, total_episodes, total_chapters, total_volumes, is_ongoing, extra_json, fetched_at, created_at, external_links_json, search_text, publisher_fr, release_json, release_checked_at, news_state_json, news_checked_at)
SELECT id, type, source, external_id, title, original_title, overview, poster_url, backdrop_url, release_date, runtime_minutes, total_episodes, total_chapters, total_volumes, is_ongoing, extra_json, fetched_at, created_at, external_links_json, search_text, publisher_fr, release_json, release_checked_at, news_state_json, news_checked_at FROM media;
DROP TABLE media;
ALTER TABLE media_new RENAME TO media;
CREATE INDEX idx_media_type_title ON media (type, title);

-- triggers de library_entries
CREATE TRIGGER trg_library_type_insert
BEFORE INSERT ON library_entries
WHEN NEW.media_type IS NOT (SELECT type FROM media WHERE id = NEW.media_id)
BEGIN
  SELECT RAISE(ABORT, 'library_entries.media_type ne correspond pas a media.type');
END;
CREATE TRIGGER trg_library_type_update
BEFORE UPDATE OF media_id, media_type ON library_entries
WHEN NEW.media_type IS NOT (SELECT type FROM media WHERE id = NEW.media_id)
BEGIN
  SELECT RAISE(ABORT, 'library_entries.media_type ne correspond pas a media.type');
END;
CREATE TRIGGER trg_library_updated_at
AFTER UPDATE ON library_entries
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE library_entries
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

-- ---------- 3. Rattacher les tables enfants (ON DELETE CASCADE) ----------

-- progress_log
CREATE TABLE progress_log_new (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('episode', 'chapter', 'volume', 'movie', 'session', 'pause', 'complete')),
  season            INTEGER,
  episode           INTEGER,
  chapter           REAL,
  volume            INTEGER,
  pause_seconds     INTEGER,
  pause_page        INTEGER,
  duration_minutes  INTEGER,
  note              TEXT,
  logged_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10),
  review            TEXT,
  tags_json         TEXT CHECK (tags_json IS NULL OR (json_valid(tags_json) AND json_type(tags_json) = 'array')),
  external_ref      TEXT,
  undo_json         TEXT CHECK (undo_json IS NULL OR json_valid(undo_json)),
  undated           INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1))
);
INSERT INTO progress_log_new (id, entry_id, kind, season, episode, chapter, volume, pause_seconds, pause_page, duration_minutes, note, logged_at, rating, review, tags_json, external_ref, undo_json, undated)
SELECT id, entry_id, kind, season, episode, chapter, volume, pause_seconds, pause_page, duration_minutes, note, logged_at, rating, review, tags_json, external_ref, undo_json, undated FROM progress_log;
DROP TABLE progress_log;
ALTER TABLE progress_log_new RENAME TO progress_log;
CREATE INDEX idx_progress_entry_date ON progress_log (entry_id, logged_at);
CREATE UNIQUE INDEX uq_progress_external_ref ON progress_log (external_ref) WHERE external_ref IS NOT NULL;

-- reminders
CREATE TABLE reminders_new (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('daily_quest', 'media', 'custom')),
  entry_id      INTEGER REFERENCES library_entries (id) ON DELETE CASCADE,
  label         TEXT,
  days_of_week  INTEGER NOT NULL DEFAULT 127 CHECK (days_of_week BETWEEN 1 AND 127),
  time_of_day   TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_sent_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (kind = 'daily_quest' AND entry_id IS NULL) OR
    (kind = 'media'       AND entry_id IS NOT NULL) OR
    (kind = 'custom'      AND entry_id IS NULL AND label IS NOT NULL)
  )
);
INSERT INTO reminders_new (id, user_id, kind, entry_id, label, days_of_week, time_of_day, is_active, last_sent_at, created_at)
SELECT id, user_id, kind, entry_id, label, days_of_week, time_of_day, is_active, last_sent_at, created_at FROM reminders;
DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX idx_reminders_active ON reminders (is_active, time_of_day);

-- reminder_events
CREATE TABLE reminder_events_new (
  id           INTEGER PRIMARY KEY,
  reminder_id  INTEGER NOT NULL REFERENCES reminders (id) ON DELETE CASCADE,
  entry_id     INTEGER REFERENCES library_entries (id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  sent_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at  TEXT
);
INSERT INTO reminder_events_new (id, reminder_id, entry_id, message, status, sent_at, resolved_at)
SELECT id, reminder_id, entry_id, message, status, sent_at, resolved_at FROM reminder_events;
DROP TABLE reminder_events;
ALTER TABLE reminder_events_new RENAME TO reminder_events;
CREATE INDEX idx_events_status_date ON reminder_events (status, sent_at);

-- focus
CREATE TABLE focus_new (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  entry_id   INTEGER NOT NULL UNIQUE REFERENCES library_entries (id) ON DELETE CASCADE,
  since      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, media_type)
) WITHOUT ROWID;
INSERT INTO focus_new (user_id, media_type, entry_id, since)
SELECT user_id, media_type, entry_id, since FROM focus;
DROP TABLE focus;
ALTER TABLE focus_new RENAME TO focus;

-- news
CREATE TABLE news_new (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_id     INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('episode', 'season', 'sequel', 'chapter', 'dlc', 'provider')),
  label        TEXT NOT NULL,
  detail       TEXT,
  url          TEXT,
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  seen_at      TEXT
);
INSERT INTO news_new (id, user_id, entry_id, kind, label, detail, url, dedupe_key, created_at, seen_at)
SELECT id, user_id, entry_id, kind, label, detail, url, dedupe_key, created_at, seen_at FROM news;
DROP TABLE news;
ALTER TABLE news_new RENAME TO news;
CREATE INDEX idx_news_user_date ON news (user_id, created_at);

-- media_seasons
CREATE TABLE media_seasons_new (
  media_id       INTEGER NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  season_number  INTEGER NOT NULL CHECK (season_number >= 0),
  episode_count  INTEGER NOT NULL CHECK (episode_count >= 0),
  name           TEXT,
  air_date       TEXT,
  PRIMARY KEY (media_id, season_number)
) WITHOUT ROWID;
INSERT INTO media_seasons_new (media_id, season_number, episode_count, name, air_date)
SELECT media_id, season_number, episode_count, name, air_date FROM media_seasons;
DROP TABLE media_seasons;
ALTER TABLE media_seasons_new RENAME TO media_seasons;

-- import_links
CREATE TABLE import_links_new (
  source        TEXT NOT NULL,
  external_key  TEXT NOT NULL,
  media_id      INTEGER NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source, external_key)
) WITHOUT ROWID;
INSERT INTO import_links_new (source, external_key, media_id, created_at)
SELECT source, external_key, media_id, created_at FROM import_links;
DROP TABLE import_links;
ALTER TABLE import_links_new RENAME TO import_links;
CREATE INDEX idx_import_links_media ON import_links (source, media_id);

PRAGMA defer_foreign_keys = OFF;
