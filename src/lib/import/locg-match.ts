// Choix de la bonne série Comic Vine pour une série League of Comic Geeks (nom + année de début + éditeur).
import type { VolumeHit } from "../sources/comicvine";
import { comparableName } from "./locg-parse";
import type { LocgSeries } from "./types";

/** « DC Comics » et « DC », « Dynamite » et « Dynamite Entertainment » : même éditeur (premier mot). */
const samePublisher = (a: string | null, b: string | null) =>
  !a || !b || comparableName(a).split(" ")[0] === comparableName(b).split(" ")[0];

export interface ComicMatch {
  match: VolumeHit | null;
  candidates: VolumeHit[];
}

/**
 * Prudent, comme pour Letterboxd : mieux vaut demander que se tromper.
 *  - même nom, même année de début et même éditeur, une seule série → sûr ;
 *  - sinon même nom, année à ±1 et même éditeur, une seule série → sûr ;
 *  - sinon : à valider, avec les séries les plus proches.
 */
export function pickComic(series: Pick<LocgSeries, "name" | "startYear" | "publisher">, hits: VolumeHit[]): ComicMatch {
  const target = comparableName(series.name);
  const unique = [...new Map(hits.map((h) => [h.id, h])).values()];
  const named = unique.filter((h) => comparableName(h.name) === target && samePublisher(h.publisher, series.publisher));
  const within = (d: number) => named.filter((h) => series.startYear !== null && h.year !== null && Math.abs(h.year - series.startYear) <= d);
  const exact = within(0);
  const near = within(1);
  const match = exact.length === 1 ? exact[0] : exact.length === 0 && near.length === 1 ? near[0] : null;

  const score = (h: VolumeHit) =>
    (comparableName(h.name) === target ? 100 : comparableName(h.name).includes(target) ? 40 : 0) +
    (samePublisher(h.publisher, series.publisher) ? 20 : 0) -
    (series.startYear !== null && h.year !== null ? Math.min(30, Math.abs(h.year - series.startYear) * 3) : 15);
  const candidates = [...unique].sort((a, b) => score(b) - score(a)).slice(0, 6);
  return { match, candidates };
}
