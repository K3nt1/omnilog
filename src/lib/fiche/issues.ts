// Associe les numéros d'une série (Comic Vine) à tes lectures enregistrées (journal).
import { issueDate, issueNumber, posterOf, type CvIssue } from "../sources/comicvine";
import type { ComicIssueResponse } from "./types";

export function matchIssues(
  issues: CvIssue[],
  logs: { id: number; chapter: number; at: string; rating: number | null; review: string | null }[],
): ComicIssueResponse[] {
  // logs : du plus récent au plus ancien, donc la première lecture trouvée est la dernière en date.
  const byNumber = new Map<number, typeof logs>();
  for (const log of logs) {
    const list = byNumber.get(log.chapter);
    if (list) list.push(log);
    else byNumber.set(log.chapter, [log]);
  }
  return issues.map((issue) => {
    const number = issueNumber(issue.issue_number);
    const reads = number !== null ? (byNumber.get(number) ?? []) : [];
    const last = reads[0];
    const reviewed = reads.find((r) => r.review);
    return {
      id: issue.id,
      label: issue.issue_number,
      number,
      name: issue.name?.trim() || null,
      coverUrl: posterOf(issue.image),
      date: issueDate(issue),
      url: issue.site_detail_url ?? null,
      read: last
        ? { logId: last.id, at: last.at, rating: last.rating, review: last.review ?? reviewed?.review ?? null, count: reads.length }
        : null,
    };
  });
}
