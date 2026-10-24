import type { LetterboxdFilm } from "./types";

/** Date d'ajout sur Letterboxd (watchlist ou film marqué vu), sinon la date du premier visionnage. */
export function letterboxdAddedDate(film: LetterboxdFilm): string | null {
  if (film.addedDate) return film.addedDate;
  const watched = film.watches.map((w) => w.watchedDate).filter((d): d is string => !!d);
  return watched.length > 0 ? watched.sort()[0] : null;
}
