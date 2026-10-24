// Fiche d'un film ou d'une série depuis TMDB : détails, équipe, plateformes (JustWatch), saga.
import { tmdbGet, tmdbImage } from "../sources/tmdb";
import { yearOf } from "../types";
import type { FicheCredit, FichePerson, FicheProvider, FicheProviders, MediaFiche, RelatedGroup } from "./types";

interface Named {
  name: string;
}

interface TmdbProviderOffer {
  provider_name: string;
  logo_path: string | null;
}

interface TmdbProviders {
  results: Record<
    string,
    { link?: string; flatrate?: TmdbProviderOffer[]; free?: TmdbProviderOffer[]; ads?: TmdbProviderOffer[]; rent?: TmdbProviderOffer[]; buy?: TmdbProviderOffer[] }
  >;
}

interface TmdbCommon {
  id: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: Named[];
  status: string;
  homepage?: string;
  production_companies?: Named[];
  external_ids?: { imdb_id?: string | null };
  "watch/providers"?: TmdbProviders;
}

interface TmdbMovieFull extends TmdbCommon {
  title: string;
  original_title: string;
  release_date: string;
  runtime: number | null;
  belongs_to_collection: { id: number; name: string } | null;
  credits?: {
    cast: { name: string; character: string; profile_path: string | null }[];
    crew: { name: string; job: string }[];
  };
}

interface TmdbTvFull extends TmdbCommon {
  name: string;
  original_name: string;
  first_air_date: string;
  episode_run_time: number[];
  number_of_episodes: number | null;
  in_production: boolean;
  created_by: Named[];
  networks: Named[];
  next_episode_to_air: { air_date: string; season_number: number; episode_number: number; name: string } | null;
  seasons: { season_number: number; episode_count: number; name: string; air_date: string | null }[];
  aggregate_credits?: {
    cast: { name: string; profile_path: string | null; roles: { character: string }[] }[];
    crew: { name: string; jobs: { job: string }[] }[];
  };
}

interface TmdbCollection {
  name: string;
  parts: { id: number; title: string; release_date?: string; poster_path: string | null }[];
}

/** Rôles affichés, dans cet ordre, avec les métiers TMDB correspondants. */
const ROLES: [label: string, jobs: string[], max: number][] = [
  ["Réalisation", ["Director"], 3],
  ["Scénario", ["Screenplay", "Writer", "Story", "Teleplay"], 4],
  ["D'après", ["Novel", "Comic Book", "Original Story", "Book"], 2],
  ["Musique", ["Original Music Composer", "Music", "Composer"], 2],
  ["Photographie", ["Director of Photography"], 2],
  ["Production", ["Producer"], 4],
];

function creditsFrom(crew: { name: string; jobs: string[] }[]): FicheCredit[] {
  return ROLES.flatMap(([role, jobs, max]) => {
    const names = [...new Set(crew.filter((c) => c.jobs.some((j) => jobs.includes(j))).map((c) => c.name))].slice(0, max);
    return names.length > 0 ? [{ role, names }] : [];
  });
}

const offers = (list: TmdbProviderOffer[] | undefined): FicheProvider[] =>
  (list ?? []).map((o) => ({ name: o.provider_name, logoUrl: tmdbImage(o.logo_path, "w92") }));

function providersFor(data: TmdbProviders | undefined, region: string): FicheProviders | null {
  const r = data?.results?.[region];
  if (!r) return { region, link: null, stream: [], free: [], rent: [], buy: [] };
  return {
    region,
    link: r.link ?? null,
    stream: offers(r.flatrate),
    free: offers([...(r.free ?? []), ...(r.ads ?? [])]),
    rent: offers(r.rent),
    buy: offers(r.buy),
  };
}

const MOVIE_STATE: Record<string, string> = {
  Rumored: "Rumeur",
  Planned: "Annoncé",
  "In Production": "En tournage",
  "Post Production": "En post-production",
  Canceled: "Annulé",
};

const TV_STATE: Record<string, string> = {
  "Returning Series": "En cours de diffusion",
  Ended: "Terminée",
  Canceled: "Annulée",
  "In Production": "En production",
  Planned: "Annoncée",
  Pilot: "Pilote",
};

/** Synopsis français, sinon anglais (beaucoup de fiches TMDB n'ont pas de résumé traduit). */
async function overviewFallback(token: string, path: string, overview: string): Promise<string | null> {
  if (overview) return overview;
  try {
    const en = await tmdbGet<{ overview: string }>(token, path, { language: "en-US" });
    return en.overview || null;
  } catch {
    return null;
  }
}

export async function getTmdbFiche(token: string, type: "movie" | "tv", id: string, region: string): Promise<MediaFiche> {
  const links = (imdb: string | null | undefined, homepage: string | undefined) => [
    { label: "TMDB", url: `https://www.themoviedb.org/${type}/${id}` },
    ...(imdb ? [{ label: "IMDb", url: `https://www.imdb.com/title/${imdb}/` }] : []),
    ...(type === "movie" ? [{ label: "Letterboxd", url: `https://letterboxd.com/tmdb/${id}/` }] : []),
    ...(homepage ? [{ label: "Site officiel", url: homepage }] : []),
  ];

  if (type === "movie") {
    const m = await tmdbGet<TmdbMovieFull>(token, `/movie/${Number(id)}`, {
      append_to_response: "credits,watch/providers,external_ids",
    });
    const [overview, collection] = await Promise.all([
      overviewFallback(token, `/movie/${Number(id)}`, m.overview),
      m.belongs_to_collection
        ? tmdbGet<TmdbCollection>(token, `/collection/${m.belongs_to_collection.id}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    const related: RelatedGroup[] = [];
    if (collection && collection.parts.length > 1) {
      related.push({
        title: collection.name,
        works: [...collection.parts]
          .sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"))
          .map((p) => ({
            type: "movie" as const,
            externalId: String(p.id),
            title: p.title,
            year: yearOf(p.release_date),
            posterUrl: tmdbImage(p.poster_path, "w342"),
            relation: p.id === m.id ? "Ce film" : null,
          })),
      });
    }

    const cast: FichePerson[] = (m.credits?.cast ?? []).slice(0, 15).map((c) => ({
      name: c.name,
      detail: c.character || null,
      photoUrl: tmdbImage(c.profile_path, "w185"),
    }));
    const companies = (m.production_companies ?? []).map((c) => c.name).slice(0, 4);

    return {
      type,
      externalId: String(m.id),
      title: m.title,
      originalTitle: m.original_title !== m.title ? m.original_title : null,
      overview,
      posterUrl: tmdbImage(m.poster_path, "w500"),
      backdropUrl: tmdbImage(m.backdrop_path, "w1280"),
      releaseDate: m.release_date || null,
      releaseLabel: "Sortie",
      runtimeMinutes: m.runtime || null,
      totalEpisodes: null,
      totalChapters: null,
      totalVolumes: null,
      state: MOVIE_STATE[m.status] ?? null,
      isOngoing: false,
      genres: m.genres.map((g) => g.name),
      credits: [
        ...creditsFrom((m.credits?.crew ?? []).map((c) => ({ name: c.name, jobs: [c.job] }))),
        ...(companies.length > 0 ? [{ role: "Sociétés de production", names: companies }] : []),
      ],
      cast,
      seasons: [],
      platforms: [],
      timeToBeat: null,
      nextEpisode: null,
      providers: providersFor(m["watch/providers"], region),
      related,
      links: links(m.external_ids?.imdb_id, m.homepage),
    };
  }

  const s = await tmdbGet<TmdbTvFull>(token, `/tv/${Number(id)}`, {
    append_to_response: "aggregate_credits,watch/providers,external_ids",
  });
  const overview = await overviewFallback(token, `/tv/${Number(id)}`, s.overview);
  const crew = (s.aggregate_credits?.crew ?? []).map((c) => ({ name: c.name, jobs: c.jobs.map((j) => j.job) }));
  const next = s.next_episode_to_air;
  const creators = s.created_by.map((c) => c.name);
  const networks = s.networks.map((n) => n.name);

  return {
    type,
    externalId: String(s.id),
    title: s.name,
    originalTitle: s.original_name !== s.name ? s.original_name : null,
    overview,
    posterUrl: tmdbImage(s.poster_path, "w500"),
    backdropUrl: tmdbImage(s.backdrop_path, "w1280"),
    releaseDate: s.first_air_date || null,
    releaseLabel: "Première diffusion",
    runtimeMinutes: s.episode_run_time[0] ?? null,
    totalEpisodes: s.number_of_episodes ?? null,
    totalChapters: null,
    totalVolumes: null,
    state: TV_STATE[s.status] ?? null,
    isOngoing: s.in_production,
    genres: s.genres.map((g) => g.name),
    credits: [
      ...(creators.length > 0 ? [{ role: "Création", names: creators }] : []),
      ...creditsFrom(crew).filter((c) => c.role !== "Réalisation"), // trop de réalisateurs d'épisodes
      ...(networks.length > 0 ? [{ role: "Diffusion", names: networks }] : []),
    ],
    cast: (s.aggregate_credits?.cast ?? []).slice(0, 15).map((c) => ({
      name: c.name,
      detail: c.roles[0]?.character || null,
      photoUrl: tmdbImage(c.profile_path, "w185"),
    })),
    seasons: s.seasons.map((season) => ({
      seasonNumber: season.season_number,
      episodeCount: season.episode_count,
      name: season.name || null,
      airDate: season.air_date || null,
    })),
    platforms: [],
    timeToBeat: null,
    nextEpisode: next
      ? {
          label: `S${String(next.season_number).padStart(2, "0")}E${String(next.episode_number).padStart(2, "0")}${next.name ? ` · ${next.name}` : ""}`,
          date: next.air_date || null,
        }
      : null,
    providers: providersFor(s["watch/providers"], region),
    related: [],
    links: links(s.external_ids?.imdb_id, s.homepage),
  };
}

export interface SeasonEpisode {
  number: number;
  name: string;
  /** Nom anglais (sert à reconnaître les épisodes importés de Letterboxd, dont les titres sont en anglais). */
  englishName: string | null;
  overview: string | null;
  stillUrl: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
}

interface TmdbSeason {
  episodes: {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string | null;
    runtime: number | null;
  }[];
}

/** Épisodes d'une saison (titres français, résumé anglais si pas de traduction). */
export async function getTmdbSeason(token: string, id: string, season: number): Promise<SeasonEpisode[]> {
  const path = `/tv/${Number(id)}/season/${season}`;
  const [fr, en] = await Promise.all([
    tmdbGet<TmdbSeason>(token, path),
    tmdbGet<TmdbSeason>(token, path, { language: "en-US" }).catch(() => null),
  ]);
  const english = new Map((en?.episodes ?? []).map((e) => [e.episode_number, e]));
  return fr.episodes.map((e) => {
    const eng = english.get(e.episode_number);
    // TMDB renvoie « Épisode 3 » quand le titre n'est pas traduit : on garde alors le titre anglais.
    const untranslated = /^(Épisode|Episode) \d+$/i.test(e.name) && eng?.name && !/^Episode \d+$/i.test(eng.name);
    return {
      number: e.episode_number,
      name: untranslated ? eng!.name : e.name,
      englishName: eng?.name ?? null,
      overview: e.overview || eng?.overview || null,
      stillUrl: tmdbImage(e.still_path, "w300"),
      airDate: e.air_date || null,
      runtimeMinutes: e.runtime || null,
    };
  });
}
