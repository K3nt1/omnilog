// Export Backloggd (fichier JSON produit par public/backloggd-export.js) → jeux à importer.
import type { LibraryStatus } from "../types";
import type { BackloggdGame, BackloggdSession } from "./types";

/** Ce que le script écrit pour chaque jeu (les champs absents valent « non »). */
interface RawGame {
  id?: string;
  slug?: string;
  title?: string;
  played?: string | null;
  playing?: string | null;
  backlog?: string | null;
  wishlist?: string | null;
  rating?: number | null;
  statusTitle?: string | null;
  mastered?: boolean;
  cover?: string | null;
}

interface RawSession {
  slug?: string;
  date?: string;
  minutes?: number | null;
}

/** Jaquette : adresse https seulement (affichée telle quelle), sinon rien. */
function coverUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface BackloggdSummary {
  user: string;
  games: BackloggdGame[];
  counts: Partial<Record<LibraryStatus, number>> & { sessions: number; mastered: number; rated: number };
  /** Sessions de jeux absents de tes listes (jeu retiré de Backloggd depuis) : ignorées. */
  orphanSessions: number;
}

/**
 * Statut Omnilog d'un jeu Backloggd :
 * en cours (Playing) d'abord ; sinon joué : Completed → Terminé, Played / Retired → Joué, Shelved → En pause,
 * Abandoned → Abandonné ; sinon Backlog → Backlog, Wishlist → Envies.
 */
export function backloggdStatus(game: RawGame): LibraryStatus | null {
  if (game.playing) return "in_progress";
  if (game.played) {
    switch ((game.statusTitle ?? "").toLowerCase()) {
      case "completed":
        return "completed";
      case "shelved":
        return "on_hold";
      case "abandoned":
        return "dropped";
      default:
        return "played"; // Played, Retired, ou statut non précisé
    }
  }
  if (game.backlog) return "planned";
  if (game.wishlist) return "wishlist";
  return null; // seulement aimé, par exemple
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,150}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBackloggdExport(text: string): BackloggdSummary {
  let data: { format?: string; user?: string; games?: RawGame[]; sessions?: RawSession[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Fichier illisible : choisis le fichier backloggd-….json téléchargé par le script.");
  }
  if (data?.format !== "omnilog-backloggd" || !Array.isArray(data.games)) {
    throw new Error("Ce n'est pas un export Backloggd fait avec le script d'Omnilog.");
  }

  // Sessions regroupées par jeu (une même date peut revenir : deux parties le même jour).
  const sessionsBySlug = new Map<string, BackloggdSession[]>();
  for (const s of data.sessions ?? []) {
    if (!s?.slug || !SLUG.test(s.slug) || !s.date || !DATE.test(s.date)) continue;
    const minutes = typeof s.minutes === "number" && s.minutes > 0 && s.minutes <= 24 * 60 ? Math.round(s.minutes) : null;
    const list = sessionsBySlug.get(s.slug) ?? [];
    list.push({ date: s.date, minutes });
    sessionsBySlug.set(s.slug, list);
  }

  const games: BackloggdGame[] = [];
  const seen = new Set<string>();
  for (const raw of data.games) {
    if (!raw?.slug || !SLUG.test(raw.slug) || seen.has(raw.slug)) continue;
    const status = backloggdStatus(raw);
    if (!status) continue;
    seen.add(raw.slug);
    const rating = typeof raw.rating === "number" && raw.rating >= 1 && raw.rating <= 10 ? Math.round(raw.rating) : null;
    games.push({
      key: `bkl:${raw.slug}`,
      slug: raw.slug,
      gameId: raw.id && /^\d{1,10}$/.test(raw.id) ? Number(raw.id) : null,
      title: (raw.title?.trim() || raw.slug).slice(0, 300),
      status,
      rating,
      mastered: raw.mastered === true,
      cover: coverUrl(raw.cover),
      sessions: (sessionsBySlug.get(raw.slug) ?? []).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2000),
    });
  }

  const counts: BackloggdSummary["counts"] = { sessions: 0, mastered: 0, rated: 0 };
  for (const g of games) {
    counts[g.status] = (counts[g.status] ?? 0) + 1;
    counts.sessions += g.sessions.length;
    if (g.mastered) counts.mastered++;
    if (g.rating !== null) counts.rated++;
  }
  const orphanSessions = [...sessionsBySlug.entries()].filter(([slug]) => !seen.has(slug)).reduce((n, [, list]) => n + list.length, 0);
  return { user: String(data.user ?? ""), games, counts, orphanSessions };
}
