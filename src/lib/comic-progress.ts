// Comics : on lit souvent des numéros isolés (achat au détail, numéro repris dans un recueil).
// La position suit donc le prochain numéro non lu, jamais au-delà du dernier, et une série n'est lue
// que quand chaque numéro de #1 au dernier l'est. Partagé par la progression et l'import LoCG.

/** Chaque numéro entier de #1 au dernier est lu (les numéros à part, #0 ou #1.5, ne comptent pas). */
export function allIssuesRead(read: Iterable<number>, total: number | null): boolean {
  if (total === null || total < 1) return false;
  const done = new Set(read);
  for (let n = 1; n <= Math.floor(total); n++) if (!done.has(n)) return false;
  return true;
}

/**
 * Prochain numéro à lire après `after` : le premier numéro entier non lu qui suit (sans dépasser le dernier),
 * sinon le premier non lu depuis #1. Null si tout est lu. Sans nombre de numéros connu : simplement le suivant.
 */
export function nextUnreadIssue(read: Iterable<number>, after: number, total: number | null): number | null {
  const done = new Set(read);
  if (total === null || total < 1) {
    let n = Math.floor(after) + 1;
    while (done.has(n)) n++;
    return n;
  }
  const last = Math.floor(total);
  for (let n = Math.max(1, Math.floor(after) + 1); n <= last; n++) if (!done.has(n)) return n;
  for (let n = 1; n <= Math.min(last, Math.floor(after)); n++) if (!done.has(n)) return n;
  return null;
}
