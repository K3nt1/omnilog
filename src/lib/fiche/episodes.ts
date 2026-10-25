import type { EpisodeLog } from "../entry";
import { episodeName } from "../labels";
import { normalizeSearch } from "../search-text";
import type { SeasonEpisode } from "./tmdb";
import type { SeasonEpisodeResponse } from "./types";

/**
 * Associe tes visionnages aux épisodes d'une saison : par numéro (saisie dans Omnilog, Serializd),
 * ou par titre pour l'import Letterboxd (« Sherlock: The Great Game » → « The Great Game »).
 */
export function matchEpisodes(
  episodes: SeasonEpisode[],
  season: number,
  seriesTitles: (string | null)[],
  logs: EpisodeLog[],
): SeasonEpisodeResponse[] {
  const named = logs
    .filter((l) => l.episode === null && l.note)
    .map((l) => ({ log: l, name: normalizeSearch(episodeName(l.note!, seriesTitles)) }));
  return episodes.map((e) => {
    const names = [e.name, e.englishName].filter((n): n is string => !!n).map(normalizeSearch);
    const matches = [
      ...logs.filter((l) => l.season === season && l.episode === e.number),
      ...named.filter((n) => names.includes(n.name)).map((n) => n.log),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const last = matches[0];
    return {
      number: e.number,
      name: e.name,
      overview: e.overview,
      stillUrl: e.stillUrl,
      airDate: e.airDate,
      runtimeMinutes: e.runtimeMinutes,
      watched: last
        ? { logId: last.id, at: last.at, rating: last.rating, review: last.review ?? matches.find((m) => m.review)?.review ?? null, count: matches.length }
        : null,
    };
  });
}
