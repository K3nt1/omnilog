// Prochaines sorties : types et textes, utilisables côté serveur comme côté navigateur.

/**
 * Prochain épisode annoncé (séries, anime) ou dernier chapitre paru (mangas).
 * `precision` : « day » = date seule (TMDB, MangaDex), « time » = heure exacte (AniList).
 */
export interface ReleaseInfo {
  kind: "next" | "last";
  /** « S02E05 », « Ép. 8 », « Ch. 1129 ». */
  label: string;
  /** AAAA-MM-JJ ou date ISO complète. */
  at: string | null;
  precision: "day" | "time";
  /** Dernière vérification auprès de la source (ISO). */
  checkedAt?: string;
}

/** Sortie affichable (un manga vérifié sans chapitre connu garde seulement sa date de vérification). */
export const displayRelease = (r: ReleaseInfo | null | undefined): ReleaseInfo | null => (r && r.label ? r : null);

export function parseRelease(json: string | null | undefined): ReleaseInfo | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as ReleaseInfo;
    return r && (r.kind === "next" || r.kind === "last") && typeof r.label === "string" ? r : null;
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;

/** Date d'une sortie : une date seule est un jour du calendrier, quel que soit le fuseau. */
function toDate(r: ReleaseInfo): Date | null {
  if (!r.at) return null;
  const d = new Date(r.at.length === 10 ? `${r.at}T00:00:00` : r.at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nombre de jours de calendrier entre aujourd'hui et la date (0 = aujourd'hui, 1 = demain, -1 = hier). */
function daysFrom(now: Date, d: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / DAY_MS);
}

const dayLabel = (d: Date, withYear = false) =>
  d.toLocaleDateString("fr-FR", { weekday: withYear ? undefined : "short", day: "numeric", month: "short", year: withYear ? "numeric" : undefined });
const timeLabel = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Texte complet, à l'heure du navigateur :
 * « Ép. 8 · demain à 16:00 », « S02E05 · dans 3 jours (mar. 4 nov.) », « Ch. 1129 · paru le 24 oct. 2026 ».
 */
export function releaseText(r: ReleaseInfo, now = new Date()): string {
  const d = toDate(r);
  if (!d) return r.label;
  const days = daysFrom(now, d);
  const at = r.precision === "time" ? ` à ${timeLabel(d)}` : "";
  if (r.kind === "last") {
    if (days === 0) return `${r.label} · paru aujourd'hui`;
    if (days === -1) return `${r.label} · paru hier`;
    return `${r.label} · paru le ${dayLabel(d, true)}`;
  }
  if (d.getTime() < now.getTime() && (r.precision === "time" || days < 0)) return `${r.label} · sorti le ${dayLabel(d, true)}`;
  if (days === 0) return `${r.label} · aujourd'hui${at}`;
  if (days === 1) return `${r.label} · demain${at}`;
  if (days < 7) return `${r.label} · dans ${days} jours (${dayLabel(d)}${at})`;
  return `${r.label} · le ${dayLabel(d, d.getFullYear() !== now.getFullYear())}${at}`;
}

/** Texte court pour une vignette : « Ép. 8 · demain », « S02E05 · 3 j », « Ch. 1129 · 24 oct. ». */
export function releaseBadge(r: ReleaseInfo, now = new Date()): string {
  const d = toDate(r);
  if (!d) return r.label;
  const days = daysFrom(now, d);
  if (r.kind === "last") return `${r.label} · ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  if (days < 0 || (r.precision === "time" && d.getTime() < now.getTime())) return `${r.label} · sorti`;
  if (days === 0) return `${r.label} · auj.`;
  if (days === 1) return `${r.label} · demain`;
  return `${r.label} · ${days} j`;
}
