// Molettes « où j'en suis » : dernier vu / lu (comme MyAnimeList) → position gardée par Omnilog (prochain à voir / lire).
import type { VolumeRange } from "./manga";
import type { MediaType, SeasonInfo } from "./types";

/** Ce que la route « position » enregistre : le prochain épisode / chapitre / numéro, et le tome en cours. */
export interface Position {
  season?: number;
  episode?: number;
  chapter?: number;
  volume?: number;
}

/** Dernier tome entièrement lu : celui dont le dernier chapitre est au plus le chapitre lu (0 : aucun). */
export function lastVolumeRead(volumes: VolumeRange[], chapter: number): number {
  return volumes.filter((r) => r.last <= chapter).at(-1)?.volume ?? 0;
}

/** Dernier vu / lu (molettes) → prochain à voir / lire et tome en cours (ce que garde Omnilog). */
export function nextPosition(p: {
  type: MediaType;
  seasons: SeasonInfo[];
  season: number;
  episode: number;
  chapter: number;
  volume: number;
  totalVolumes: number | null;
}): Position {
  if (p.type === "tv") {
    const count = p.seasons.find((s) => s.seasonNumber === p.season)?.episodeCount ?? 0;
    const following = p.seasons.find((s) => s.seasonNumber > p.season);
    // Dernier épisode de la saison vu : on reprend au début de la saison suivante, s'il y en a une.
    if (count > 0 && p.episode >= count && following) return { season: following.seasonNumber, episode: 1 };
    return { season: p.season, episode: Math.max(1, p.episode + 1) };
  }
  if (p.type === "anime") return { episode: Math.max(1, p.episode + 1) };
  if (p.type === "comic") return { chapter: p.chapter + 1 };
  // Manga : tome en cours = celui d'après le dernier tome lu (sans dépasser le dernier tome connu).
  const inProgress = p.totalVolumes ? Math.min(p.volume + 1, p.totalVolumes) : p.volume + 1;
  return { chapter: Math.floor(p.chapter) + 1, volume: Math.max(1, inProgress) };
}

/** Valeurs d'une molette : from, from + 1, … to, avec `extra` (ex. un chapitre 10,5) inséré à sa place. */
export function range(from: number, to: number, extra?: number): number[] {
  const list = Array.from({ length: Math.max(0, Math.floor(to) - from + 1) }, (_, i) => from + i);
  if (extra !== undefined && Number.isFinite(extra) && !list.includes(extra)) {
    list.push(extra);
    list.sort((a, b) => a - b);
  }
  return list;
}
