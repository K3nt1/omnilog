-- Migration number: 0002 	 2026-10-17T08:30:10.976Z
-- =====================================================================
-- Migration 0002 : schéma initial d'Omnilog
-- Conventions :
--   * dates en texte ISO 8601 UTC  (ex. 2026-10-17T09:00:00.000Z)
--   * booléens en INTEGER 0 / 1
--   * "position" d'une œuvre = le PROCHAIN élément à consommer
-- =====================================================================


-- ---------------------------------------------------------------------
-- users : un seul utilisateur pour l'instant (id = 1), mais la colonne
-- user_id partout évite une migration pénible si tu ouvres à des proches.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  display_name   TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'Europe/Paris',  -- fuseau IANA, sert à envoyer les rappels à la bonne heure locale
  timezone_auto  INTEGER NOT NULL DEFAULT 1 CHECK (timezone_auto IN (0, 1)),
                 -- 1 = mis à jour automatiquement depuis le fuseau du navigateur à chaque visite
                 -- 0 = fixé manuellement dans les paramètres
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO users (id, display_name, timezone) VALUES (1, 'Moi', 'Asia/Nicosia');


-- ---------------------------------------------------------------------
-- media : le catalogue (cache des infos TMDB / IGDB / MAL).
-- Une œuvre n'existe qu'une fois, quel que soit le nombre d'utilisateurs.
-- ---------------------------------------------------------------------
CREATE TABLE media (
  id               INTEGER PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('movie', 'tv', 'anime', 'manga', 'game')),
  source           TEXT NOT NULL CHECK (source IN ('tmdb', 'igdb', 'mal', 'manual')),
  external_id      TEXT,                 -- ID chez la source (null si ajout manuel)
  title            TEXT NOT NULL,
  original_title   TEXT,
  overview         TEXT,
  poster_url       TEXT,
  backdrop_url     TEXT,
  release_date     TEXT,                 -- AAAA-MM-JJ
  runtime_minutes  INTEGER,              -- film : durée ; série / anime : durée moyenne d'un épisode
  total_episodes   INTEGER,              -- anime (null si inconnu / en diffusion)
  total_chapters   INTEGER,              -- manga (null si inconnu / en publication)
  total_volumes    INTEGER,              -- manga
  is_ongoing       INTEGER NOT NULL DEFAULT 0 CHECK (is_ongoing IN (0, 1)),  -- encore en diffusion / publication
  extra_json       TEXT,                 -- données secondaires : genres, plateformes, studio…
  fetched_at       TEXT,                 -- dernière synchro avec l'API (TMDB impose un rafraîchissement < 6 mois)
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (type, source, external_id)     -- "type" inclus : chez TMDB, un film et une série peuvent avoir le même ID
);

CREATE INDEX idx_media_type_title ON media (type, title);


-- ---------------------------------------------------------------------
-- media_seasons : nombre d'épisodes par saison (séries TV, via TMDB).
-- Permet de passer de S07E07 (dernier épisode) à S08E01 automatiquement.
-- Saison 0 = épisodes spéciaux, ignorés par le moteur de progression.
-- (Les animés n'en ont pas besoin : chez MAL chaque saison est une œuvre distincte.)
-- ---------------------------------------------------------------------
CREATE TABLE media_seasons (
  media_id       INTEGER NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  season_number  INTEGER NOT NULL CHECK (season_number >= 0),
  episode_count  INTEGER NOT NULL CHECK (episode_count >= 0),
  name           TEXT,
  air_date       TEXT,
  PRIMARY KEY (media_id, season_number)
) WITHOUT ROWID;


-- ---------------------------------------------------------------------
-- library_entries : TA relation à une œuvre (statut, focus, position, pause, note).
-- ---------------------------------------------------------------------
CREATE TABLE library_entries (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_id          INTEGER NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
  media_type        TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'anime', 'manga', 'game')),
                    -- copie de media.type (vérifiée par trigger), nécessaire pour l'index "un focus par type"

  -- Statut
  status            TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned', 'in_progress', 'on_hold', 'completed', 'dropped')),
                    -- planned = watchlist / backlog ; on_hold = en pause longue durée
  is_focus          INTEGER NOT NULL DEFAULT 0 CHECK (is_focus IN (0, 1)),
                    -- "je regarde / lis / joue à ÇA en ce moment" → c'est ce qui alimente la quête du jour

  -- Position = prochain élément à consommer
  current_season    INTEGER CHECK (current_season >= 1),     -- série TV
  current_episode   INTEGER CHECK (current_episode >= 1),    -- série TV, anime
  current_chapter   REAL    CHECK (current_chapter >= 0),    -- manga (REAL : chapitres 1110.5 possibles)

  -- Pause à l'intérieur de l'élément en cours (null = pas de pause)
  pause_seconds     INTEGER CHECK (pause_seconds >= 0),      -- film / épisode : "pause à 01:12:30"
  pause_page        INTEGER CHECK (pause_page >= 1),         -- manga : "chapitre 42, page 12"
  game_checkpoint   TEXT,                                    -- jeu (optionnel) : lieu, chapitre, boss…

  -- Jeux
  sessions_count    INTEGER NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
  playtime_minutes  INTEGER CHECK (playtime_minutes >= 0),

  -- Avis
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10), -- 1 à 10 = 0,5 à 5 étoiles
  review            TEXT,

  started_at        TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  UNIQUE (user_id, media_id),
  CHECK (is_focus = 0 OR status = 'in_progress')             -- seul un média "en cours" peut être le focus
);

-- Un seul focus par type de média : un film, une série, un anime, un manga et un jeu au maximum.
CREATE UNIQUE INDEX uq_library_one_focus_per_type
  ON library_entries (user_id, media_type)
  WHERE is_focus = 1;

CREATE INDEX idx_library_user_status ON library_entries (user_id, status);

-- Garantit que media_type correspond bien au type de l'œuvre.
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

-- Met à jour updated_at automatiquement.
CREATE TRIGGER trg_library_updated_at
AFTER UPDATE ON library_entries
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE library_entries
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;


-- ---------------------------------------------------------------------
-- progress_log : historique de chaque validation (épisode vu, chapitre lu,
-- session de jeu, film vu, pause enregistrée). Sert aux stats et à annuler.
-- ---------------------------------------------------------------------
CREATE TABLE progress_log (
  id                INTEGER PRIMARY KEY,
  entry_id          INTEGER NOT NULL REFERENCES library_entries (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('episode', 'chapter', 'movie', 'session', 'pause')),
  season            INTEGER,
  episode           INTEGER,
  chapter           REAL,
  pause_seconds     INTEGER,
  pause_page        INTEGER,
  duration_minutes  INTEGER,               -- jeu : durée de la session
  note              TEXT,                  -- jeu : checkpoint atteint, ou commentaire libre
  logged_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_progress_entry_date ON progress_log (entry_id, logged_at);


-- ---------------------------------------------------------------------
-- reminders : planification des rappels.
--   kind = 'daily_quest' → la quête du jour (un message avec tous tes focus)
--   kind = 'media'       → rappel perso sur une œuvre (bonus de connexion,
--                          nouvel épisode de One Piece le dimanche…)
-- days_of_week est un masque : lun=1, mar=2, mer=4, jeu=8, ven=16, sam=32, dim=64.
--   127 = tous les jours ; 64 = dimanche seulement ; 21 = lun + mer + ven.
-- time_of_day est l'heure LOCALE de l'utilisateur (voir users.timezone).
-- ---------------------------------------------------------------------
CREATE TABLE reminders (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('daily_quest', 'media')),
  entry_id      INTEGER REFERENCES library_entries (id) ON DELETE CASCADE,
  label         TEXT,                      -- ex. "Bonus de connexion", "Nouvel épisode"
  days_of_week  INTEGER NOT NULL DEFAULT 127 CHECK (days_of_week BETWEEN 1 AND 127),
  time_of_day   TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_sent_at  TEXT,                      -- évite d'envoyer deux fois le même rappel
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (kind = 'daily_quest' AND entry_id IS NULL) OR
    (kind = 'media'       AND entry_id IS NOT NULL)
  )
);

CREATE INDEX idx_reminders_active ON reminders (is_active, time_of_day);

-- Quête du jour par défaut : tous les jours à 9h (modifiable plus tard dans l'interface).
INSERT INTO reminders (user_id, kind, label, time_of_day) VALUES (1, 'daily_quest', 'Quête du jour', '09:00');


-- ---------------------------------------------------------------------
-- reminder_events : chaque rappel réellement envoyé, et ce que tu en as fait.
-- Une quête du jour génère un événement par œuvre en focus ; les boutons
-- Telegram (✅ Fait / ⏭️ Passer) pointeront vers l'id de l'événement.
-- ---------------------------------------------------------------------
CREATE TABLE reminder_events (
  id           INTEGER PRIMARY KEY,
  reminder_id  INTEGER NOT NULL REFERENCES reminders (id) ON DELETE CASCADE,
  entry_id     INTEGER REFERENCES library_entries (id) ON DELETE CASCADE,
  message      TEXT NOT NULL,              -- ex. "Game of Thrones, S08E04, pause à 00:23:10"
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  sent_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at  TEXT
);

CREATE INDEX idx_events_status_date ON reminder_events (status, sent_at);