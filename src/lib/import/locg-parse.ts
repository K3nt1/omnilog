// Lit l'export Excel de League of Comic Geeks (une ligne par numéro) et le regroupe par série.
// Colonnes utiles : Publisher Name, Series Name, Full Title, Release Date, Marked Read, My Rating.
// Collection, liste d'envies, prix… ne sont pas repris : Omnilog ne garde que lu / pas lu.
// Les recueils (HC, TP) sont ignorés : leurs numéros s'ajoutent à la main.
import type { Cell } from "./xlsx";
import type { LocgIssue, LocgSeries } from "./types";

/** « Batman (Vol. 2) (2011 - 2016) » → { name: "Batman", startYear: 2011 }. */
export function parseSeriesName(series: string): { name: string; startYear: number | null } {
  const year = series.match(/\((\d{4})(?:\s*-\s*(?:\d{4}|Present))?\)\s*$/i);
  const name = series
    .replace(/\s*\(\d{4}(?:\s*-\s*(?:\d{4}|Present))?\)\s*$/i, "")
    .replace(/\s*\(Vol\.\s*\d+\)\s*$/i, "")
    .trim();
  return { name, startYear: year ? Number(year[1]) : null };
}

/** Comparaison de noms : sans accents, ponctuation ni casse ; « & » = « and ». */
export const comparableName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface LocgSummary {
  series: LocgSeries[];
  /** Recueils (HC, TP) ignorés : souvent des éditions françaises que Comic Vine ne connaît pas. */
  compilations: number;
  counts: { rows: number; issues: number; read: number; rated: number };
}

const text = (c: Cell | undefined) => (c === null || c === undefined ? "" : String(c).trim());
const flag = (c: Cell | undefined) => c === 1 || c === "1" || (typeof c === "string" && c.toLowerCase() === "true");

export function buildLocgSeries(rows: Cell[][]): LocgSummary {
  const header = (rows[0] ?? []).map((h) => text(h).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const c = {
    publisher: col("publisher name"),
    series: col("series name"),
    title: col("full title"),
    date: col("release date"),
    read: col("marked read"),
    rating: col("my rating"),
  };
  if (c.series < 0 || c.title < 0 || c.read < 0) {
    throw new Error("Colonnes introuvables : est-ce bien l'export Excel de League of Comic Geeks ?");
  }

  const groups = new Map<string, LocgSeries & { byNumber: Map<number, LocgIssue> }>();
  let compilations = 0;
  let issues = 0;
  for (const row of rows.slice(1)) {
    const seriesName = text(row[c.series]);
    const title = text(row[c.title]);
    if (!seriesName || !title) continue;
    const publisher = text(row[c.publisher]) || null;
    const releaseDate = /^\d{4}-\d{2}-\d{2}/.test(text(row[c.date])) ? text(row[c.date]).slice(0, 10) : null;
    const read = flag(row[c.read]);
    let issue = title.match(/^(.*?)\s*#(\d+(?:\.\d+)?)\b/);
    if (!issue) {
      if (/\b(HC|TP)\b/.test(title)) {
        compilations++;
        continue;
      }
      // Sans numéro mais pas un recueil (one-shot) : un numéro 1 dans sa série.
      issue = ["", "", "1"] as unknown as RegExpMatchArray;
    }
    issues++;
    const parsed = parseSeriesName(seriesName);
    // Annual ou spécial rangé dans la série principale (« Batman Annual #1 » dans « Batman (Vol. 2) ») :
    // Comic Vine en fait une série à part, cherchée sous son propre nom.
    const prefix = issue[1].trim();
    const separate = prefix !== "" && comparableName(prefix) !== comparableName(parsed.name);
    const key = `locg:${publisher ?? ""}|${separate ? prefix : seriesName}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: separate ? prefix : parsed.name,
        label: separate ? prefix : seriesName,
        publisher,
        startYear: separate ? (releaseDate ? Number(releaseDate.slice(0, 4)) : null) : parsed.startYear,
        issues: [],
        byNumber: new Map(),
      };
      groups.set(key, group);
    }
    const number = Number(issue[2]);
    const rating = typeof row[c.rating] === "number" && (row[c.rating] as number) > 0 ? (row[c.rating] as number) : null;
    // Variantes du même numéro : lu si l'une l'est, meilleure note gardée.
    const known = group.byNumber.get(number);
    if (known) {
      known.read ||= read;
      if (rating !== null && (known.rating === null || rating > known.rating)) known.rating = rating;
    } else {
      group.byNumber.set(number, { number, read, rating });
    }
  }

  const series = [...groups.values()].map(({ byNumber, ...s }) => ({
    ...s,
    issues: [...byNumber.values()].sort((a, b) => a.number - b.number),
  }));
  const all = series.flatMap((s) => s.issues);
  return {
    series: series.sort((a, b) => a.label.localeCompare(b.label)),
    compilations,
    counts: { rows: issues + compilations, issues: all.length, read: all.filter((i) => i.read).length, rated: all.filter((i) => i.rating !== null).length },
  };
}
