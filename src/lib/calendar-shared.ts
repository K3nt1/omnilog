// Calendrier : jours, regroupement des activités par œuvre et libellés (sans accès à la base, testable).
import { durationLabel, ficheHref, issueLabel } from "./labels";
import { localNow } from "./local-time";
import type { ReleasePrecision } from "./release-shared";
import { MEDIA_TYPES, type MediaType } from "./types";

export type CalendarKind = "movie" | "episode" | "chapter" | "volume" | "session" | "complete" | "add" | "release";
export type CalendarAction = "tout" | "vus" | "ajouts" | "sorties";

/** Une activité du journal (ou un ajout, ou une date de fin saisie sur la fiche). */
export interface CalendarActivity {
  entryId: number;
  type: MediaType;
  externalId: string | null;
  title: string;
  posterUrl: string | null;
  kind: CalendarKind;
  /** AAAA-MM-JJ dans ton fuseau. */
  day: string;
  season: number | null;
  episode: number | null;
  chapter: number | null;
  volume: number | null;
  minutes: number | null;
  note: string | null;
  rating: number | null;
  review: string | null;
  /** Déjà vu / lu / joué avant : « revu », « relu », « rejoué ». */
  again: boolean;
  /** Sortie à venir : ce qui sort (« S02E05 », « #42 », vide pour un film ou un jeu) et l'heure locale si elle est connue. */
  release?: { label: string; time: string | null };
}

/** Ce qu'un jour affiche pour une œuvre : une ou plusieurs lignes (« Vu : S1 É7 et É8 »). */
export interface CalendarWork {
  entryId: number;
  type: MediaType;
  title: string;
  posterUrl: string | null;
  href: string;
  lines: string[];
  rating: number | null;
  review: string | null;
  /** Nombre d'activités (épisodes, numéros…) de l'œuvre ce jour-là. */
  count: number;
  /** Seulement une sortie à venir (affiche grisée, « à venir »). */
  upcoming: boolean;
}

/** Sortie du mois sans jour précis : date de couverture d'un comic, jeu annoncé pour un mois, un trimestre ou une année. */
export interface VagueRelease {
  entryId: number;
  type: MediaType;
  title: string;
  posterUrl: string | null;
  href: string;
  /** « #42 », vide pour un jeu. */
  label: string;
  /** « novembre 2026 », « 4e trimestre 2026 », « 2027 ». */
  when: string;
}

/** Libellé d'une date approximative (AAAA-MM-JJ, telle que rangée par la source). */
export function vagueLabel(date: string, precision: Exclude<ReleasePrecision, "day">): string {
  const [y, m] = date.split("-").map(Number);
  if (precision === "year" || precision === "tbd") return String(y);
  if (precision === "quarter") {
    const q = Math.floor((m - 1) / 3) + 1;
    return `${q === 1 ? "1er" : `${q}e`} trimestre ${y}`;
  }
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface CalendarDay {
  day: string;
  works: CalendarWork[];
  /** Ajouts faits par un import sans date d'origine : résumés en une ligne. */
  importedAdds: number;
  /** Activités vu / lu / joué (sans les ajouts). */
  activityCount: number;
}

/**
 * Jour d'une date enregistrée, dans ton fuseau. Les dates sans heure (imports à minuit UTC,
 * date choisie dans « ✓ Vu » enregistrée à midi UTC) restent sur leur jour.
 */
export function dayOf(value: string, timeZone: string): string {
  if (value.length === 10) return value;
  if (/T(00:00:00|12:00:00)(\.000)?Z$/.test(value)) return value.slice(0, 10);
  return localNow(timeZone, new Date(value)).date;
}

const AGAIN: Record<MediaType, string> = { movie: "Revu", tv: "Revu", anime: "Revu", manga: "Relu", game: "Rejoué", comic: "Relu" };
const DONE: Record<MediaType, string> = { movie: "Vu", tv: "Vu", anime: "Vu", manga: "Lu", game: "Joué", comic: "Lu" };

/** [1,2,3,5,7,8] → « 1 à 3, 5, 7 et 8 » (avec `fmt` pour chaque nombre). */
export function rangesLabel(numbers: number[], fmt: (n: number) => string = (n) => n.toLocaleString("fr-FR")): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && Number.isInteger(sorted[j]) && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${fmt(sorted[i])} à ${fmt(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(fmt(sorted[k]));
    i = j + 1;
  }
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;
}

/** Lignes d'une œuvre pour un jour, à partir de ses activités. */
export function workLines(type: MediaType, activities: CalendarActivity[]): string[] {
  const lines: string[] = [];
  for (const again of [false, true]) {
    const verb = again ? AGAIN[type] : DONE[type];
    const acts = activities.filter((a) => a.again === again);
    if (acts.some((a) => a.kind === "movie")) lines.push(verb);
    const episodes = acts.filter((a) => a.kind === "episode" && a.season !== null && a.episode !== null);
    if (episodes.length > 0) {
      const seasons = [...new Set(episodes.map((e) => e.season!))].sort((a, b) => a - b);
      const parts = seasons.map((s) => {
        const eps = episodes.filter((e) => e.season === s).map((e) => e.episode!);
        return `S${s} ${rangesLabel(eps, (n) => `É${n}`)}`;
      });
      lines.push(`${verb} : ${parts.join(" · ")}`);
    }
    const chapters = acts.filter((a) => a.kind === "chapter" && a.chapter !== null).map((a) => a.chapter!);
    if (chapters.length > 0) {
      lines.push(
        type === "comic"
          ? `${verb} : ${rangesLabel(chapters, issueLabel)}`
          : `${verb} : ${chapters.length > 1 ? "chapitres" : "chapitre"} ${rangesLabel(chapters)}`,
      );
    }
    const volumes = acts.filter((a) => a.kind === "volume" && a.volume !== null).map((a) => a.volume!);
    if (volumes.length > 0) lines.push(`${verb} : ${volumes.length > 1 ? "tomes" : "tome"} ${rangesLabel(volumes)}`);
    if (acts.some((a) => a.kind === "complete")) lines.push(again ? `Terminé (${AGAIN[type].toLowerCase()} en entier)` : "Terminé");
  }
  const sessions = activities.filter((a) => a.kind === "session");
  if (sessions.length > 0) {
    const minutes = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
    const note = [...sessions].reverse().find((s) => s.note)?.note;
    lines.push(
      [sessions.length > 1 ? `${sessions.length} sessions` : "Session", minutes > 0 ? durationLabel(minutes) : null, note ? `« ${note} »` : null]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if (activities.some((a) => a.kind === "add")) lines.push("Ajouté à ta bibliothèque");
  for (const a of activities.filter((x) => x.kind === "release" && x.release)) {
    const what = a.release!.label ? `À venir : ${a.release!.label}` : "Sortie";
    lines.push(a.release!.time ? `${what} à ${a.release!.time.replace(":", " h ")}` : what);
  }
  return lines;
}

/** Regroupe les activités par jour, puis par œuvre (dans l'ordre où elles sont arrivées). */
export function groupByDay(activities: CalendarActivity[], importedAdds: Map<string, number>): Map<string, CalendarDay> {
  const days = new Map<string, CalendarDay>();
  const dayOfMap = (day: string) => {
    let d = days.get(day);
    if (!d) {
      d = { day, works: [], importedAdds: 0, activityCount: 0 };
      days.set(day, d);
    }
    return d;
  };
  const byDayEntry = new Map<string, CalendarActivity[]>();
  for (const a of activities) {
    const key = `${a.day}|${a.entryId}`;
    const list = byDayEntry.get(key);
    if (list) list.push(a);
    else byDayEntry.set(key, [a]);
  }
  for (const [key, acts] of byDayEntry) {
    const day = dayOfMap(key.split("|")[0]);
    const first = acts[0];
    const counted = acts.filter((a) => a.kind !== "add" && a.kind !== "release").length;
    day.activityCount += counted;
    const rated = [...acts].reverse().find((a) => a.rating !== null);
    const reviewed = acts.find((a) => a.review);
    day.works.push({
      entryId: first.entryId,
      type: first.type,
      title: first.title,
      posterUrl: first.posterUrl,
      href: ficheHref(first.type, first.externalId),
      lines: workLines(first.type, acts),
      rating: rated?.rating ?? null,
      review: reviewed?.review ?? null,
      count: counted,
      upcoming: acts.every((a) => a.kind === "release"),
    });
  }
  for (const [day, n] of importedAdds) dayOfMap(day).importedAdds = n;
  return days;
}

/** Semaines du mois (lundi → dimanche) : null pour les cases hors du mois. */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** « 2026-11 » ± n mois. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** « types=movie,tv » → types valides ; vide = tous. */
export function parseTypes(value: string | undefined): MediaType[] {
  const wanted = (value ?? "").split(",").filter((t): t is MediaType => (MEDIA_TYPES as readonly string[]).includes(t));
  return wanted.length > 0 ? wanted : [...MEDIA_TYPES];
}

/** Vue année : une case par jour (semaines du lundi au dimanche), niveau 0 à 4. */
export interface YearStats {
  year: number;
  counts: Record<string, number>;
  byType: Record<MediaType, number>;
  total: number;
  activeDays: number;
  longestStreak: number;
  undated: number;
}

export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = previous !== null && t - previous === 86400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = t;
  }
  return best;
}

/** Seuils des niveaux 1 à 4 : quartiles des jours actifs (un jour de marathon n'écrase pas les autres). */
export function heatThresholds(counts: number[]): [number, number, number] {
  const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0];
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
  return [q(0.25), q(0.5), q(0.75)];
}

/** Niveau de couleur d'un jour : 0 (rien) à 4. */
export function heatLevel(count: number, [q1, q2, q3]: [number, number, number]): number {
  if (count <= 0) return 0;
  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}
