/**
 * Lecteur CSV (RFC 4180) : gère les guillemets, les virgules et les retours
 * à la ligne à l'intérieur des champs (fréquents dans les critiques Letterboxd).
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** CSV -> objets indexés par les noms de colonnes de la première ligne. */
export function csvToObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return rows.map((cells) => Object.fromEntries(names.map((name, i) => [name, cells[i] ?? ""])));
}
