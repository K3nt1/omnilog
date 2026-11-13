// Lecture de la première feuille d'un classeur Excel (.xlsx) dans le navigateur, sans dépendance :
// un .xlsx est un ZIP de fichiers XML (readZipTextFiles), dont on lit les cellules par expressions régulières.

const decodeXml = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Texte d'un élément <si> ou <is> : concaténation de ses <t> (texte enrichi en plusieurs morceaux). */
const richText = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");

/** « C12 » → 2 (colonnes numérotées à partir de 0). */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export type Cell = string | number | null;

/**
 * Lignes de la première feuille (`files` : contenu des fichiers du ZIP).
 * Cellules gérées : texte partagé (t="s"), texte en ligne (inlineStr), formule texte (str), nombre, booléen.
 */
export function readXlsxRows(files: Record<string, string>): Cell[][] {
  const sheetPath = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetPath) throw new Error("Aucune feuille trouvée dans ce fichier Excel.");
  const shared = [...(files["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1]));
  const rows: Cell[][] = [];
  for (const row of files[sheetPath].matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Cell[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1] ?? "n";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: Cell = null;
      if (type === "inlineStr") value = richText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (type === "s") value = raw !== undefined ? (shared[Number(raw)] ?? null) : null;
      else if (type === "str") value = raw !== undefined ? decodeXml(raw) : null;
      else if (raw !== undefined) value = Number(raw);
      cells[ref ? columnIndex(ref) : cells.length] = value === "" ? null : value;
    }
    rows.push(Array.from(cells, (c) => c ?? null));
  }
  return rows;
}
