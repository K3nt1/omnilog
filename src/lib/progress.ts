// Suivi au quotidien : progression (épisode, chapitre, session, pause, fin), focus, tirage au sort, annulation.
import { CURRENT_USER_ID } from "./library";
import type { LibraryStatus, MediaType } from "./types";

/** État de l'entrée que la progression modifie (et que « Annuler » remet). */
interface EntryState {
  status: LibraryStatus;
  /** Calculé à partir de la table focus (pas une colonne modifiable). */
  is_focus: number;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  current_volume: number | null;
  pause_seconds: number | null;
  pause_page: number | null;
  game_checkpoint: string | null;
  sessions_count: number;
  playtime_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  drawn_at: string | null;
}

const STATE_COLUMNS: (keyof EntryState)[] = [
  "status",
  "is_focus",
  "current_season",
  "current_episode",
  "current_chapter",
  "current_volume",
  "pause_seconds",
  "pause_page",
  "game_checkpoint",
  "sessions_count",
  "playtime_minutes",
  "started_at",
  "completed_at",
  "drawn_at",
];

/** Colonnes réellement écrites dans library_entries (le focus vit dans sa propre table). */
const UPDATABLE = STATE_COLUMNS.filter((c) => c !== "is_focus");

const FOCUS_EXPR = "EXISTS (SELECT 1 FROM focus f WHERE f.entry_id = l.id)";

/** Met une entrée en focus de son type (remplace l'ancien focus de ce type). */
const focusUpsert = (db: D1Database, type: MediaType, entryId: number) =>
  db
    .prepare(
      `INSERT INTO focus (user_id, media_type, entry_id) VALUES (?, ?, ?)
       ON CONFLICT (user_id, media_type) DO UPDATE SET entry_id = excluded.entry_id,
         since = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(CURRENT_USER_ID, type, entryId);

const focusDelete = (db: D1Database, entryId: number) => db.prepare("DELETE FROM focus WHERE entry_id = ?").bind(entryId);

interface LoadedEntry extends EntryState {
  id: number;
  media_type: MediaType;
  external_id: string | null;
  total_episodes: number | null;
  total_chapters: number | null;
  total_volumes: number | null;
  is_ongoing: number;
}

export type ProgressAction =
  /** Pause dans le film / l'épisode en cours (secondes), ou page du chapitre en cours (manga). */
  | { kind: "pause"; seconds?: number; page?: number }
  | { kind: "clearPause" }
  /** Épisode en cours vu (série, anime) : passe au suivant, termine l'œuvre après le dernier. */
  | { kind: "episode"; date?: string }
  /** Chapitre en cours lu (manga). */
  | { kind: "chapter"; date?: string }
  /**
   * Tome entier lu (manga) : le tome en cours par défaut, ou un tome précis (« Tome 12 lu »).
   * `lastChapter` : dernier chapitre de ce tome d'après MangaDex (rempli par la route), pour avancer le chapitre aussi.
   */
  | { kind: "volume"; volume?: number; date?: string; lastChapter?: number | null }
  /** Choisir où on en est, sans rien enregistrer au journal. */
  | { kind: "position"; season?: number; episode?: number; chapter?: number; volume?: number | null }
  /** Session de jeu : date, durée, où j'en suis (facultatif). */
  | { kind: "session"; date?: string; minutes?: number; note?: string }
  /** Œuvre terminée (film vu, série / anime / manga / jeu fini). */
  | { kind: "complete"; date?: string; rating?: number | null; review?: string | null }
  /** Épisode précis coché dans la liste des saisons (série), avec note et critique facultatives. */
  | { kind: "markEpisode"; season: number; episode: number; date?: string; rating?: number | null; review?: string | null }
  | { kind: "undo" };

export class ProgressError extends Error {}

const today = () => new Date().toISOString().slice(0, 10);
/** Date de journal : la date choisie à minuit UTC, ou maintenant. */
const loggedAt = (date: string | undefined) => (date && date !== today() ? `${date}T12:00:00.000Z` : new Date().toISOString());

async function loadEntry(db: D1Database, entryId: number) {
  const [entryRows, seasonRows, focusRows] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT l.id, l.media_type, ${STATE_COLUMNS.map((c) => (c === "is_focus" ? `${FOCUS_EXPR} AS is_focus` : `l.${c}`)).join(", ")},
                m.external_id, m.total_episodes, m.total_chapters, m.total_volumes, m.is_ongoing
         FROM library_entries l JOIN media m ON m.id = l.media_id
         WHERE l.id = ? AND l.user_id = ?`,
      )
      .bind(entryId, CURRENT_USER_ID),
    db
      .prepare(
        `SELECT s.season_number, s.episode_count FROM media_seasons s
         JOIN library_entries l ON l.media_id = s.media_id
         WHERE l.id = ? AND s.season_number > 0 AND s.episode_count > 0 ORDER BY s.season_number`,
      )
      .bind(entryId),
    db
      .prepare(
        `SELECT f.entry_id FROM focus f JOIN library_entries l ON l.user_id = f.user_id AND l.media_type = f.media_type
         WHERE l.id = ? AND f.entry_id <> l.id`,
      )
      .bind(entryId),
  ]);
  const entry = entryRows.results[0] as unknown as LoadedEntry | undefined;
  if (!entry) return null;
  const seasons = (seasonRows.results as { season_number: number; episode_count: number }[]).map((s) => ({
    season: s.season_number,
    episodes: s.episode_count,
  }));
  return { entry, seasons, otherFocus: focusRows.results.length > 0 };
}

/** Épisode suivant d'une série : S07E07 → S08E01 grâce au nombre d'épisodes par saison ; null après le dernier. */
export function nextTvEpisode(
  seasons: { season: number; episodes: number }[],
  season: number,
  episode: number,
): { season: number; episode: number } | null {
  const current = seasons.find((s) => s.season === season);
  if (current && episode < current.episodes) return { season, episode: episode + 1 };
  if (!current && seasons.length === 0) return { season, episode: episode + 1 }; // saisons inconnues
  const next = seasons.find((s) => s.season > season);
  return next ? { season: next.season, episode: 1 } : null;
}

interface Plan {
  set: Partial<EntryState>;
  logs: { kind: string; season?: number | null; episode?: number | null; chapter?: number | null; volume?: number | null; pauseSeconds?: number | null; pausePage?: number | null; minutes?: number | null; note?: string | null; at: string; rating?: number | null; review?: string | null }[];
  /** Devient le focus de son type (l'ancien focus le perd). */
  takeFocus: boolean;
  /** Perd le focus (œuvre terminée). */
  dropFocus?: boolean;
  /** L'œuvre vient d'être terminée (pour passer au film suivant de la saga, à la saison suivante d'un anime…). */
  completed?: boolean;
  /** Épisodes sautés à cocher aussi (de la position actuelle jusqu'à l'épisode coché), à la même date. */
  bulkEpisodes?: { season: number; episode: number; at: string }[];
}

/**
 * Épisodes de `from` (inclus) jusqu'à `to` (exclu), dans l'ordre des saisons ; vide si `to` est avant `from`.
 * Saisons inconnues : seulement à l'intérieur d'une même saison.
 */
export function episodesBetween(
  seasons: { season: number; episodes: number }[],
  from: { season: number; episode: number },
  to: { season: number; episode: number },
): { season: number; episode: number }[] {
  const out: { season: number; episode: number }[] = [];
  if (seasons.length === 0) {
    if (from.season === to.season) for (let e = from.episode; e < to.episode; e++) out.push({ season: from.season, episode: e });
    return out;
  }
  let cursor: { season: number; episode: number } | null = from;
  while (cursor && (cursor.season < to.season || (cursor.season === to.season && cursor.episode < to.episode))) {
    out.push(cursor);
    if (out.length > 500) break; // garde-fou
    cursor = nextTvEpisode(seasons, cursor.season, cursor.episode);
  }
  return out;
}

/** Ce que fait une action, à partir de l'état actuel (fonction pure, testée séparément). */
export function planAction(
  entry: LoadedEntry,
  seasons: { season: number; episodes: number }[],
  otherFocus: boolean,
  action: Exclude<ProgressAction, { kind: "undo" }>,
): Plan {
  const started = entry.started_at ?? today();
  const progressing = { status: "in_progress" as LibraryStatus, started_at: started, drawn_at: null };
  // Une œuvre sur laquelle on avance devient le focus s'il n'y en a pas déjà un pour ce type.
  const autoFocus = !otherFocus;
  const complete = (date: string | undefined, extra: Partial<Plan["logs"][number]> = {}): Plan => ({
    set: {
      status: "completed",
      completed_at: date ?? today(),
      started_at: entry.started_at,
      pause_seconds: null,
      pause_page: null,
      drawn_at: null,
    },
    logs: [{ kind: entry.media_type === "movie" ? "movie" : "complete", at: loggedAt(date), ...extra }],
    takeFocus: false,
    dropFocus: true,
    completed: true,
  });

  switch (action.kind) {
    case "pause": {
      if (entry.media_type === "manga") {
        if (!action.page || action.page < 1) throw new ProgressError("Page invalide.");
        return {
          set: { ...progressing, pause_page: action.page, current_chapter: entry.current_chapter ?? 1 },
          logs: [{ kind: "pause", chapter: entry.current_chapter ?? 1, pausePage: action.page, at: loggedAt(undefined) }],
          takeFocus: true, // règle : ce qu'on a mis en pause en dernier devient le focus
        };
      }
      if (entry.media_type === "game") throw new ProgressError("Pas de pause pour un jeu : enregistre une session.");
      if (action.seconds === undefined || action.seconds < 0 || action.seconds > 24 * 3600) throw new ProgressError("Durée invalide.");
      const position =
        entry.media_type === "tv"
          ? { current_season: entry.current_season ?? 1, current_episode: entry.current_episode ?? 1 }
          : entry.media_type === "anime"
            ? { current_episode: entry.current_episode ?? 1 }
            : {};
      return {
        set: { ...progressing, ...position, pause_seconds: action.seconds },
        logs: [
          {
            kind: "pause",
            season: position.current_season ?? null,
            episode: position.current_episode ?? null,
            pauseSeconds: action.seconds,
            at: loggedAt(undefined),
          },
        ],
        takeFocus: true,
      };
    }

    case "clearPause":
      return { set: { pause_seconds: null, pause_page: null }, logs: [], takeFocus: false };

    case "position": {
      const set: Partial<EntryState> = { pause_seconds: null, pause_page: null };
      if (entry.media_type === "tv") {
        if (!action.season || !action.episode || action.season < 1 || action.episode < 1) throw new ProgressError("Épisode invalide.");
        Object.assign(set, { current_season: action.season, current_episode: action.episode });
      } else if (entry.media_type === "anime") {
        if (!action.episode || action.episode < 1) throw new ProgressError("Épisode invalide.");
        set.current_episode = action.episode;
      } else if (entry.media_type === "manga") {
        if (action.chapter === undefined && action.volume === undefined) throw new ProgressError("Chapitre invalide.");
        if (action.chapter !== undefined) {
          if (action.chapter < 0) throw new ProgressError("Chapitre invalide.");
          set.current_chapter = action.chapter;
        }
        if (action.volume !== undefined) {
          if (action.volume !== null && (!Number.isInteger(action.volume) || action.volume < 1)) throw new ProgressError("Tome invalide.");
          set.current_volume = action.volume;
        }
      } else {
        throw new ProgressError("Pas de position pour ce type.");
      }
      return { set, logs: [], takeFocus: false };
    }

    case "episode": {
      if (entry.media_type === "tv") {
        const season = entry.current_season ?? 1;
        const episode = entry.current_episode ?? 1;
        const log = { kind: "episode", season, episode, at: loggedAt(action.date) };
        const next = nextTvEpisode(seasons, season, episode);
        if (!next && !entry.is_ongoing) {
          const done = complete(action.date);
          return { ...done, set: { ...done.set, current_season: season, current_episode: episode }, logs: [log, ...done.logs] };
        }
        const after = next ?? { season, episode: episode + 1 }; // série en cours : on attend le prochain épisode
        return {
          set: { ...progressing, current_season: after.season, current_episode: after.episode, pause_seconds: null },
          logs: [log],
          takeFocus: autoFocus,
        };
      }
      if (entry.media_type === "anime") {
        const episode = entry.current_episode ?? 1;
        const log = { kind: "episode", episode, at: loggedAt(action.date) };
        if (entry.total_episodes && episode >= entry.total_episodes) {
          const done = complete(action.date);
          return { ...done, set: { ...done.set, current_episode: episode }, logs: [log, ...done.logs] };
        }
        return { set: { ...progressing, current_episode: episode + 1, pause_seconds: null }, logs: [log], takeFocus: autoFocus };
      }
      throw new ProgressError("Pas d'épisodes pour ce type.");
    }

    case "chapter": {
      if (entry.media_type !== "manga") throw new ProgressError("Pas de chapitres pour ce type.");
      const chapter = entry.current_chapter ?? 1;
      const log = { kind: "chapter", chapter, at: loggedAt(action.date) };
      if (entry.total_chapters && chapter >= entry.total_chapters) {
        const done = complete(action.date);
        return { ...done, set: { ...done.set, current_chapter: chapter }, logs: [log, ...done.logs] };
      }
      return { set: { ...progressing, current_chapter: Math.floor(chapter) + 1, pause_page: null }, logs: [log], takeFocus: autoFocus };
    }

    case "volume": {
      if (entry.media_type !== "manga") throw new ProgressError("Pas de tomes pour ce type.");
      const volume = action.volume ?? entry.current_volume ?? 1;
      if (!Number.isInteger(volume) || volume < 1) throw new ProgressError("Tome invalide.");
      const last = action.lastChapter ?? null;
      const log = { kind: "volume", volume, chapter: last, at: loggedAt(action.date) };
      // Le chapitre en cours passe juste après le dernier chapitre du tome (jamais en arrière).
      const chapter =
        last !== null ? Math.max(entry.current_chapter ?? 1, Math.floor(last) + 1) : entry.current_chapter;
      if (entry.total_volumes && volume >= entry.total_volumes && !entry.is_ongoing) {
        const done = complete(action.date);
        return {
          ...done,
          set: { ...done.set, current_volume: volume, current_chapter: last !== null ? Math.max(entry.current_chapter ?? 1, last) : entry.current_chapter },
          logs: [log, ...done.logs],
        };
      }
      return {
        set: {
          ...progressing,
          current_volume: Math.max(entry.current_volume ?? 1, volume + 1),
          current_chapter: chapter,
          pause_page: null,
        },
        logs: [log],
        takeFocus: autoFocus,
      };
    }

    case "session": {
      if (entry.media_type !== "game") throw new ProgressError("Les sessions sont réservées aux jeux.");
      const minutes = action.minutes ?? null;
      if (minutes !== null && (minutes < 1 || minutes > 24 * 60)) throw new ProgressError("Durée de session invalide.");
      const note = action.note?.trim() || null;
      return {
        set: {
          ...progressing,
          sessions_count: entry.sessions_count + 1,
          playtime_minutes: minutes !== null ? (entry.playtime_minutes ?? 0) + minutes : entry.playtime_minutes,
          game_checkpoint: note ?? entry.game_checkpoint,
        },
        logs: [{ kind: "session", minutes, note, at: loggedAt(action.date) }],
        takeFocus: autoFocus,
      };
    }

    case "complete":
      return complete(action.date, { rating: action.rating ?? null, review: action.review?.trim() || null });

    case "markEpisode": {
      if (entry.media_type !== "tv") throw new ProgressError("Seuls les épisodes de séries se cochent un par un.");
      if (action.season < 0 || action.episode < 1) throw new ProgressError("Épisode invalide.");
      const log = {
        kind: "episode",
        season: action.season,
        episode: action.episode,
        at: loggedAt(action.date),
        rating: action.rating ?? null,
        review: action.review?.trim() || null,
      };
      const season = entry.current_season ?? 1;
      const episode = entry.current_episode ?? 1;
      // Épisode à la position actuelle ou après : on avance juste après lui. Épisode plus ancien (ou spécial) :
      // simple visionnage au journal, la position ne bouge pas.
      const atOrAfter = action.season > 0 && (action.season > season || (action.season === season && action.episode >= episode));
      if (!atOrAfter) {
        const status = entry.status === "planned" ? progressing : {};
        return { set: status, logs: [log], takeFocus: entry.status === "planned" && autoFocus };
      }
      // Les épisodes entre la position actuelle et celui coché sont considérés comme vus (comme Serializd).
      const skipped = episodesBetween(seasons, { season, episode }, { season: action.season, episode: action.episode }).map(
        (e) => ({ ...e, at: log.at }),
      );
      const next = nextTvEpisode(seasons, action.season, action.episode);
      if (!next && !entry.is_ongoing) {
        const done = complete(action.date);
        return {
          ...done,
          set: { ...done.set, current_season: action.season, current_episode: action.episode },
          logs: [log, ...done.logs],
          bulkEpisodes: skipped,
        };
      }
      const after = next ?? { season: action.season, episode: action.episode + 1 };
      return {
        set: { ...progressing, current_season: after.season, current_episode: after.episode, pause_seconds: null },
        logs: [log],
        takeFocus: autoFocus,
        bulkEpisodes: skipped,
      };
    }
  }
}

const SET_SQL = (keys: string[]) => keys.map((k) => `${k} = ?`).join(", ");

export interface ProgressResult {
  /** L'œuvre vient d'être terminée. */
  completed: boolean;
  /** Elle était le focus de son type juste avant. */
  wasFocus: boolean;
  type: MediaType;
  externalId: string | null;
}

/** Applique une action ; renvoie null si l'entrée n'existe pas. */
export async function recordProgress(db: D1Database, entryId: number, action: ProgressAction): Promise<ProgressResult | null> {
  if (action.kind === "undo") {
    const undone = await undoLastProgress(db, entryId);
    return undone ? { completed: false, wasFocus: false, type: undone, externalId: null } : null;
  }
  const loaded = await loadEntry(db, entryId);
  if (!loaded) return null;
  const { entry, seasons, otherFocus } = loaded;
  const plan = planAction(entry, seasons, otherFocus, action);

  const set: Partial<EntryState> = { ...plan.set };
  delete set.is_focus;
  const keys = Object.keys(set) as (keyof EntryState)[];

  const statements: D1PreparedStatement[] = [];
  if (keys.length > 0) {
    statements.push(
      db.prepare(`UPDATE library_entries SET ${SET_SQL(keys)} WHERE id = ?`).bind(...keys.map((k) => set[k] ?? null), entryId),
    );
  }
  if (plan.takeFocus) statements.push(focusUpsert(db, entry.media_type, entryId));
  if (plan.dropFocus) statements.push(focusDelete(db, entryId));
  if (plan.logs.length > 0) {
    // Même « groupe » pour toutes les lignes d'une action : « Annuler » les retire ensemble.
    const snapshot = Object.fromEntries(STATE_COLUMNS.map((c) => [c, entry[c]]));
    const undo = JSON.stringify({ group: crypto.randomUUID(), state: snapshot });
    const insert = db.prepare(
      `INSERT INTO progress_log (entry_id, kind, season, episode, chapter, volume, pause_seconds, pause_page,
                                 duration_minutes, note, logged_at, rating, review, undo_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    if (plan.bulkEpisodes && plan.bulkEpisodes.length > 0) {
      // Une seule requête pour tous les épisodes sautés (déjà cochés : ignorés).
      statements.push(
        db
          .prepare(
            `INSERT INTO progress_log (entry_id, kind, season, episode, logged_at, undo_json)
             SELECT ?1, 'episode', json_extract(value, '$[0]'), json_extract(value, '$[1]'), ?2, ?3
             FROM json_each(?4)
             WHERE NOT EXISTS (SELECT 1 FROM progress_log p WHERE p.entry_id = ?1 AND p.kind = 'episode'
                               AND p.season = json_extract(value, '$[0]') AND p.episode = json_extract(value, '$[1]'))`,
          )
          .bind(entryId, plan.bulkEpisodes[0].at, undo, JSON.stringify(plan.bulkEpisodes.map((e) => [e.season, e.episode]))),
      );
    }
    for (const log of plan.logs) {
      statements.push(
        insert.bind(
          entryId,
          log.kind,
          log.season ?? null,
          log.episode ?? null,
          log.chapter ?? null,
          log.volume ?? null,
          log.pauseSeconds ?? null,
          log.pausePage ?? null,
          log.minutes ?? null,
          log.note ?? null,
          log.at,
          log.rating ?? null,
          log.review ?? null,
          undo,
        ),
      );
    }
  }
  if (statements.length > 0) await db.batch(statements);
  return { completed: plan.completed === true, wasFocus: entry.is_focus === 1, type: entry.media_type, externalId: entry.external_id };
}

/** Annule la dernière progression enregistrée dans Omnilog (pas les visionnages importés) ; renvoie le type, ou null. */
export async function undoLastProgress(db: D1Database, entryId: number): Promise<MediaType | null> {
  const last = await db
    .prepare(
      `SELECT p.undo_json, l.media_type FROM progress_log p JOIN library_entries l ON l.id = p.entry_id
       WHERE p.entry_id = ? AND l.user_id = ? AND p.undo_json IS NOT NULL ORDER BY p.id DESC LIMIT 1`,
    )
    .bind(entryId, CURRENT_USER_ID)
    .first<{ undo_json: string; media_type: MediaType }>();
  if (!last) return null;
  const { group, state } = JSON.parse(last.undo_json) as { group: string; state: EntryState };
  const keys = UPDATABLE.filter((c) => c in state);
  await db.batch([
    db.prepare(`UPDATE library_entries SET ${SET_SQL(keys)} WHERE id = ?`).bind(...keys.map((k) => state[k] ?? null), entryId),
    // Le focus revient comme avant (y compris s'il était passé au film suivant de la saga).
    state.is_focus === 1 ? focusUpsert(db, last.media_type, entryId) : focusDelete(db, entryId),
    db.prepare("DELETE FROM progress_log WHERE entry_id = ? AND json_extract(undo_json, '$.group') = ?").bind(entryId, group),
  ]);
  return last.media_type;
}

/** Y a-t-il une progression à annuler ? (pour afficher le bouton) */
export async function hasUndo(db: D1Database, entryId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM progress_log WHERE entry_id = ? AND undo_json IS NOT NULL LIMIT 1")
    .bind(entryId)
    .first<{ ok: number }>();
  return !!row;
}

/** Met (ou retire) une œuvre en focus, sans toucher à son statut. L'ancien focus du type le perd. */
export async function setFocus(db: D1Database, entryId: number, focus: boolean): Promise<boolean> {
  const entry = await db
    .prepare("SELECT media_type FROM library_entries WHERE id = ? AND user_id = ?")
    .bind(entryId, CURRENT_USER_ID)
    .first<{ media_type: MediaType }>();
  if (!entry) return false;
  await db.batch(
    focus
      ? [focusUpsert(db, entry.media_type, entryId)]
      : [focusDelete(db, entryId), db.prepare("UPDATE library_entries SET drawn_at = NULL WHERE id = ?").bind(entryId)],
  );
  return true;
}

/**
 * Tirage au sort dans la watchlist / le backlog d'un type : l'œuvre tirée devient le focus (son statut ne change pas).
 * Relancer : l'œuvre tirée précédemment perd sa marque « tirée au sort » et le focus passe à la nouvelle.
 * Renvoie l'entrée tirée, ou null si la watchlist / le backlog est vide.
 */
export async function drawRandom(db: D1Database, type: MediaType): Promise<number | null> {
  const [drawnRows, pickRows] = await db.batch<{ id: number }>([
    db
      .prepare("SELECT id FROM library_entries WHERE user_id = ? AND media_type = ? AND drawn_at IS NOT NULL")
      .bind(CURRENT_USER_ID, type),
    db
      .prepare(
        `SELECT id FROM library_entries WHERE user_id = ? AND media_type = ? AND status = 'planned' AND drawn_at IS NULL
         ORDER BY random() LIMIT 1`,
      )
      .bind(CURRENT_USER_ID, type),
  ]);
  const picked = pickRows.results[0]?.id ?? null;
  const previous = drawnRows.results.map((r) => r.id);
  // Rien d'autre à tirer : on garde le tirage actuel (ou rien s'il n'y en a pas).
  if (picked === null) return previous[0] ?? null;

  const statements: D1PreparedStatement[] = [];
  if (previous.length > 0) {
    statements.push(
      db
        .prepare(`UPDATE library_entries SET drawn_at = NULL WHERE id IN (${previous.map(() => "?").join(", ")})`)
        .bind(...previous),
    );
  }
  statements.push(
    db.prepare("UPDATE library_entries SET drawn_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(picked),
    focusUpsert(db, type, picked),
  );
  await db.batch(statements);
  return picked;
}
