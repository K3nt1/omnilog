// Lit l'export XML de MyAnimeList (animelist / mangalist).
// Le format est simple et stable : extraction par expressions régulières,
// sans dépendre du DOMParser du navigateur (donc testable côté Node).
import type { LibraryStatus } from "../types";
import type { MalImportItem } from "./types";

const STATUS: Record<string, LibraryStatus> = {
  Watching: "in_progress",
  Reading: "in_progress",
  Completed: "completed",
  "On-Hold": "on_hold",
  Dropped: "dropped",
  "Plan to Watch": "planned",
  "Plan to Read": "planned",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readTag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!match) return "";
  const value = match[1].trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1] : decodeEntities(value);
}

const toInt = (value: string) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
};

/** MAL utilise "0000-00-00" pour "inconnu" et parfois "2023-05-00" pour une date partielle. */
const toDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) && !value.includes("-00") ? value : null);

export interface MalParseResult {
  kind: "anime" | "manga";
  items: MalImportItem[];
  ignored: number; // entrées au statut inconnu
}

export function parseMalXml(xml: string): MalParseResult {
  const kind: "anime" | "manga" = /<anime>/.test(xml) ? "anime" : "manga";
  const blocks = xml.match(new RegExp(`<${kind}>[\\s\\S]*?</${kind}>`, "g")) ?? [];
  const items: MalImportItem[] = [];
  let ignored = 0;

  for (const block of blocks) {
    const malId = readTag(block, kind === "anime" ? "series_animedb_id" : "manga_mangadb_id");
    const status = STATUS[readTag(block, "my_status")];
    if (!/^\d+$/.test(malId) || !status) {
      ignored++;
      continue;
    }
    const score = toInt(readTag(block, "my_score"));
    const total = toInt(readTag(block, kind === "anime" ? "series_episodes" : "manga_chapters"));
    items.push({
      key: `mal:${kind}:${malId}`,
      kind,
      malId,
      title: readTag(block, kind === "anime" ? "series_title" : "manga_title"),
      status,
      score: score >= 1 && score <= 10 ? score : null,
      progress: toInt(readTag(block, kind === "anime" ? "my_watched_episodes" : "my_read_chapters")),
      total: total > 0 ? total : null,
      startDate: toDate(readTag(block, "my_start_date")),
      finishDate: toDate(readTag(block, "my_finish_date")),
    });
  }
  return { kind, items, ignored };
}
