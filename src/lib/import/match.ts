// Choix du bon film TMDB pour une entrée Letterboxd (titre + année).
import type { TmdbMovieHit } from "../sources/tmdb";
import { yearOf } from "../types";

/** "Amélie & Nino : l'Été !" -> "amelie and nino l ete" */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface MatchOutcome {
  match: TmdbMovieHit | null;
  candidates: TmdbMovieHit[]; // proposés dans l'écran de validation si pas de certitude
}

/**
 * Règles (volontairement prudentes : mieux vaut demander que se tromper) :
 *  - avec année : titre identique (titre ou titre original) ET même année -> sûr ;
 *    sinon titre identique ET année à ±1 (sorties décalées selon les pays) -> sûr ;
 *  - sans année : un seul résultat au titre identique -> sûr ;
 *  - sinon : à valider, avec les 3 premiers résultats comme candidats.
 */
export function pickMatch(name: string, year: number | null, hits: TmdbMovieHit[]): MatchOutcome {
  const target = normalizeTitle(name);
  const sameTitle = (hit: TmdbMovieHit) =>
    normalizeTitle(hit.title) === target || normalizeTitle(hit.original_title) === target;
  const candidates = hits.slice(0, 3);

  if (year !== null) {
    const hitYear = (hit: TmdbMovieHit) => yearOf(hit.release_date);
    const exact = hits.find((hit) => sameTitle(hit) && hitYear(hit) === year);
    if (exact) return { match: exact, candidates };
    const near = hits.find((hit) => {
      const y = hitYear(hit);
      return sameTitle(hit) && y !== null && Math.abs(y - year) <= 1;
    });
    if (near) return { match: near, candidates };
    return { match: null, candidates };
  }

  const titled = hits.filter(sameTitle);
  return { match: titled.length === 1 ? titled[0] : null, candidates };
}
