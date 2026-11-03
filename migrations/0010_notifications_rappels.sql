-- Migration 0010 : notifications et rappels (v0.7.0).
--
-- 1. reminders reconstruite (SQLite ne sait pas modifier une contrainte CHECK) : nouveau type 'custom',
--    un rappel libre sans œuvre (« Bonus de connexion Dokkan, tous les jours à 10 h »), qui a forcément un libellé.
--    La table ne contient que la quête du jour créée par la 0002 (aucun événement) : la reconstruction ne perd rien.
--    La quête du jour passe à 12 h par défaut (si elle n'a pas été modifiée).
-- 2. push_subscriptions : un appareil abonné aux notifications (navigateur ou app installée).
--    last_message_id : dernier message déjà affiché par cet appareil (chaque appareil reçoit tout).
-- 3. push_messages : le contenu des notifications. Les notifications partent « vides » ; l'appareil vient
--    chercher ici ce qu'il doit afficher (pas de chiffrement du contenu à gérer).
-- 4. media.release_checked_at : dernière vérification de la prochaine sortie (rafraîchissement automatique,
--    les moins récemment vérifiées d'abord).
--
-- Écritures : une poignée (une ligne recopiée, deux tables vides, une colonne ajoutée).

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
SELECT id, user_id, kind, entry_id, label, days_of_week,
       CASE WHEN kind = 'daily_quest' AND time_of_day = '09:00' THEN '12:00' ELSE time_of_day END,
       is_active, last_sent_at, created_at
FROM reminders;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX idx_reminders_active ON reminders (is_active, time_of_day);

CREATE TABLE push_subscriptions (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  user_agent       TEXT,
  last_message_id  INTEGER NOT NULL DEFAULT 0,
  failures         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_success_at  TEXT
);

CREATE TABLE push_messages (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '/aujourdhui',
  tag         TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_push_messages_user ON push_messages (user_id, id);

ALTER TABLE media ADD COLUMN release_checked_at TEXT;
