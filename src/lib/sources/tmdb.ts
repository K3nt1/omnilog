// TMDB : films et séries. Doc : https://developer.themoviedb.org/reference
import { fetchJson } from "./http";
import { resultKey, yearOf, type MediaDetails, type MediaType, type SearchResult } from "../types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

const poster = (path: string | null | undefined) => (path ? `${IMG}/w342${path}` : null);
const backdrop = (path: string | null | undefined) => (path ? `${IMG}/w1280${path}` : null);

function tmdb<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries({ language: "fr-FR", ...params })) {
    url.searchParams.set(key, value);
  }
  return fetchJson<T>("TMDB", url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

interface TmdbMultiItem {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

export async function searchTmdb(token: string, query: string, types: Set<MediaType>): Promise<SearchResult[]> {
  const data = await tmdb<{ results: TmdbMultiItem[] }>(token, "/search/multi", {
    query,
    include_adult: "false",
  });

  return data.results.flatMap((item): SearchResult[] => {
    if (item.media_type === "person" || !types.has(item.media_type)) return [];
    const type = item.media_type;
    const title = (type === "movie" ? item.title : item.name) ?? "Sans titre";
    const original = (type === "movie" ? item.original_title : item.original_name) ?? null;
    const externalId = String(item.id);
    return [
      {
        key: resultKey(type, "tmdb", externalId),
        type,
        source: "tmdb",
        externalId,
        title,
        originalTitle: original && original !== title ? original : null,
        year: yearOf(type === "movie" ? item.release_date : item.first_air_date),
        posterUrl: poster(item.poster_path),
        libraryStatus: null,
      },
    ];
  });
}

/** Résultat brut de /search/movie, utilisé par l'import pour retrouver un film. */
export interface TmdbMovieHit {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  poster_path?: string | null;
}

/**
 * Recherche de films par titre (+ année). En anglais par défaut : Letterboxd
 * exporte les titres anglais, la comparaison est donc bien plus fiable.
 */
export async function searchTmdbMovieHits(
  token: string,
  query: string,
  year: number | null,
  language = "en-US",
): Promise<TmdbMovieHit[]> {
  const params: Record<string, string> = { query, include_adult: "false", language };
  if (year) params.year = String(year);
  const data = await tmdb<{ results: TmdbMovieHit[] }>(token, "/search/movie", params);
  return data.results;
}

export const tmdbPosterUrl = poster;

interface TmdbGenre {
  name: string;
}

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  status: string;
  genres: TmdbGenre[];
}

interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  episode_run_time: number[];
  in_production: boolean;
  number_of_episodes: number | null;
  genres: TmdbGenre[];
  seasons: { season_number: number; episode_count: number; name: string; air_date: string | null }[];
}

export async function getTmdbDetails(token: string, type: "movie" | "tv", id: string): Promise<MediaDetails> {
  if (type === "movie") {
    const m = await tmdb<TmdbMovie>(token, `/movie/${id}`);
    return {
      type,
      source: "tmdb",
      externalId: String(m.id),
      title: m.title,
      originalTitle: m.original_title !== m.title ? m.original_title : null,
      overview: m.overview || null,
      posterUrl: poster(m.poster_path),
      backdropUrl: backdrop(m.backdrop_path),
      releaseDate: m.release_date || null,
      runtimeMinutes: m.runtime || null,
      totalEpisodes: null,
      totalChapters: null,
      totalVolumes: null,
      isOngoing: false,
      seasons: [],
      extra: { genres: m.genres.map((g) => g.name), status: m.status },
    };
  }

  const s = await tmdb<TmdbTv>(token, `/tv/${id}`);
  return {
    type,
    source: "tmdb",
    externalId: String(s.id),
    title: s.name,
    originalTitle: s.original_name !== s.name ? s.original_name : null,
    overview: s.overview || null,
    posterUrl: poster(s.poster_path),
    backdropUrl: backdrop(s.backdrop_path),
    releaseDate: s.first_air_date || null,
    runtimeMinutes: s.episode_run_time[0] ?? null,
    totalEpisodes: s.number_of_episodes ?? null,
    totalChapters: null,
    totalVolumes: null,
    isOngoing: s.in_production,
    seasons: s.seasons.map((season) => ({
      seasonNumber: season.season_number,
      episodeCount: season.episode_count,
      name: season.name || null,
      airDate: season.air_date || null,
    })),
    extra: { genres: s.genres.map((g) => g.name) },
  };
}

/** Appel brut à l'API TMDB (fiche média). */
export const tmdbGet = tmdb;
export const tmdbImage = (path: string | null | undefined, size: string) => (path ? `${IMG}/${size}${path}` : null);
