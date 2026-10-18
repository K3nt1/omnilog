// Transforme les CSV de l'export Letterboxd en une liste de films prêts à importer.
// Fonctions pures : aucune dépendance au navigateur, testables avec les vrais fichiers.
import { csvToObjects } from "./csv";
import type { LetterboxdFilm, LetterboxdWatch } from "./types";

export interface LetterboxdSummary {
  films: LetterboxdFilm[];
  counts: { watched: number; watchlist: number; diary: number; reviews: number; liked: number; orphans: number };
}

/**
 * Chemins relatifs à la racine de l'export : retire le dossier englobant
 * ("letterboxd-pseudo-2026-10-17-17-37-utc/") s'il est commun à tous les fichiers.
 */
export function relativizePaths(files: Record<string, string>): Record<string, string> {
  const paths = Object.keys(files);
  const first = paths[0]?.split("/")[0];
  const shared = first && paths.every((p) => p.startsWith(`${first}/`));
  if (!shared) return files;
  return Object.fromEntries(Object.entries(files).map(([p, content]) => [p.slice(first.length + 1), content]));
}

const toYear = (value: string | undefined) => {
  const year = Number.parseInt(value ?? "", 10);
  return Number.isFinite(year) ? year : null;
};

const toRating = (value: string | undefined) => {
  const rating = Number.parseFloat(value ?? "");
  return Number.isFinite(rating) && rating > 0 ? rating : null;
};

const toDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

const splitTags = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const nameYearKey = (name: string, year: string) => `${name}\u0000${year}`;

export function buildLetterboxdFilms(rawFiles: Record<string, string>): LetterboxdSummary {
  const files = relativizePaths(rawFiles);
  const read = (path: string) => (files[path] ? csvToObjects(files[path]) : []);

  const watched = read("watched.csv");
  const ratings = read("ratings.csv");
  const reviews = read("reviews.csv");
  const diary = read("diary.csv");
  const watchlist = read("watchlist.csv");
  const likes = read("likes/films.csv");
  const orphaned = read("orphaned/diary.csv");

  const films = new Map<string, LetterboxdFilm>(); // clé : lien boxd.it du film
  const byNameYear = new Map<string, LetterboxdFilm>();

  for (const row of watched) {
    const uri = row["Letterboxd URI"];
    if (!uri) continue;
    const film: LetterboxdFilm = {
      key: `lb:${uri}`,
      uri,
      name: row.Name,
      year: toYear(row.Year),
      status: "completed",
      rating: null,
      liked: false,
      addedDate: toDate(row.Date),
      watches: [],
    };
    films.set(uri, film);
    byNameYear.set(nameYearKey(row.Name, row.Year), film);
  }

  for (const row of ratings) {
    const film = films.get(row["Letterboxd URI"]);
    if (film) film.rating = toRating(row.Rating);
  }

  for (const row of likes) {
    const film = films.get(row["Letterboxd URI"]);
    if (film) film.liked = true;
  }

  // Les critiques partagent le lien boxd.it de l'entrée de journal correspondante.
  const reviewByEntry = new Map(reviews.map((r) => [r["Letterboxd URI"], r.Review || null]));

  const toWatch = (row: Record<string, string>, ref: string): LetterboxdWatch => ({
    ref,
    watchedDate: toDate(row["Watched Date"]) ?? toDate(row.Date),
    rating: toRating(row.Rating),
    rewatch: row.Rewatch === "Yes",
    tags: splitTags(row.Tags),
    review: reviewByEntry.get(ref) ?? null,
  });

  let orphans = 0;
  const orphanFilm = (row: Record<string, string>): LetterboxdFilm => {
    const key = nameYearKey(row.Name, row.Year);
    let film = byNameYear.get(key);
    if (!film) {
      orphans++;
      film = {
        key: `lb:orphan:${row.Name}:${row.Year}`,
        uri: null,
        name: row.Name,
        year: toYear(row.Year),
        status: "completed",
        rating: null,
        liked: false,
        addedDate: toDate(row.Date),
        watches: [],
      };
      byNameYear.set(key, film);
      films.set(film.key, film);
    }
    return film;
  };

  // Le journal pointe vers ses entrées, pas vers le film : on relie par titre + année.
  for (const row of diary) {
    const film = orphanFilm(row);
    film.watches.push(toWatch(row, row["Letterboxd URI"] || `orphan:${row.Name}:${row.Year}:${row["Watched Date"]}`));
  }
  for (const row of orphaned) {
    const film = orphanFilm(row);
    film.watches.push(toWatch(row, `orphan:${row.Name}:${row.Year}:${row["Watched Date"]}`));
  }

  // Note de secours : celle du dernier visionnage noté.
  for (const film of films.values()) {
    if (film.rating === null) {
      const rated = [...film.watches].reverse().find((w) => w.rating !== null);
      film.rating = rated?.rating ?? null;
    }
  }

  let planned = 0;
  for (const row of watchlist) {
    const uri = row["Letterboxd URI"];
    if (!uri || films.has(uri)) continue;
    planned++;
    films.set(uri, {
      key: `lb:${uri}`,
      uri,
      name: row.Name,
      year: toYear(row.Year),
      status: "planned",
      rating: null,
      liked: false,
      addedDate: toDate(row.Date),
      watches: [],
    });
  }

  const all = [...films.values()];
  return {
    films: [...all.filter((f) => f.status === "completed"), ...all.filter((f) => f.status === "planned")],
    counts: {
      watched: watched.length,
      watchlist: planned,
      diary: diary.length + orphaned.length,
      reviews: reviews.length,
      liked: all.filter((f) => f.liked).length,
      orphans,
    },
  };
}
