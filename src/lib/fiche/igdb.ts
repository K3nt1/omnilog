// Fiche d'un jeu depuis IGDB : studios, plateformes, durée de vie, DLC, remakes, jeux de la même série.
import { SourceError } from "../sources/http";
import { igdbImage, igdbQuery, type IgdbCredentials } from "../sources/igdb";
import { yearOf } from "../types";
import type { MediaFiche, RelatedGroup, RelatedWork } from "./types";

interface IgdbRef {
  id: number;
  name?: string;
  cover?: { image_id: string };
  first_release_date?: number;
}

interface IgdbFull {
  id: number;
  name: string;
  slug: string;
  url?: string;
  summary?: string;
  cover?: { image_id: string };
  artworks?: { image_id: string }[];
  screenshots?: { image_id: string }[];
  first_release_date?: number;
  genres?: { name: string }[];
  platforms?: { name: string; abbreviation?: string }[];
  involved_companies?: { company?: { name: string }; developer?: boolean; publisher?: boolean }[];
  collections?: { name: string; games?: number[] }[];
  franchises?: { name: string; games?: number[] }[];
  dlcs?: number[];
  expansions?: number[];
  standalone_expansions?: number[];
  remakes?: number[];
  remasters?: number[];
  parent_game?: number;
}

const BASE_FIELDS =
  "name, slug, url, summary, cover.image_id, artworks.image_id, screenshots.image_id, first_release_date, genres.name, platforms.name, platforms.abbreviation";
const EXTRA_FIELDS =
  "involved_companies.company.name, involved_companies.developer, involved_companies.publisher, collections.name, collections.games, franchises.name, franchises.games, dlcs, expansions, standalone_expansions, remakes, remasters, parent_game";

const unixToDate = (seconds: number | undefined) => (seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null);
const toMinutes = (seconds: number | undefined) => (seconds && seconds > 0 ? Math.round(seconds / 60) : null);

export async function getIgdbFiche(env: IgdbCredentials, id: string): Promise<MediaFiche> {
  const gameId = Number(id);
  const [game, times] = await Promise.all([
    // Si IGDB refuse un champ (API qui évolue), on retombe sur les champs de base plutôt que d'échouer.
    igdbQuery<IgdbFull[]>(env, "games", `fields ${BASE_FIELDS}, ${EXTRA_FIELDS}; where id = ${gameId};`)
      .catch((error) => {
        if (error instanceof SourceError && error.status === 400) {
          return igdbQuery<IgdbFull[]>(env, "games", `fields ${BASE_FIELDS}; where id = ${gameId};`);
        }
        throw error;
      })
      .then((rows) => rows[0]),
    igdbQuery<{ hastily?: number; normally?: number; completely?: number }[]>(
      env,
      "game_time_to_beats",
      `fields hastily, normally, completely; where game_id = ${gameId};`,
    )
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
  ]);
  if (!game) throw new SourceError("IGDB", "IGDB : jeu introuvable", 404);

  // Œuvres liées : une seule requête de plus pour leurs noms et jaquettes.
  const series = game.collections?.[0] ?? game.franchises?.[0];
  const seriesIds = (series?.games ?? []).filter((g) => g !== gameId).slice(0, 40);
  const groups: [title: string, ids: number[], relation: string | null][] = [
    ["Jeu principal", game.parent_game ? [game.parent_game] : [], "Jeu principal"],
    ["DLC et extensions", [...(game.dlcs ?? []), ...(game.expansions ?? []), ...(game.standalone_expansions ?? [])], null],
    ["Remakes et remasters", [...(game.remakes ?? []), ...(game.remasters ?? [])], null],
    [series ? `Série ${series.name}` : "Même série", seriesIds, null],
  ];
  const wanted = [...new Set(groups.flatMap(([, ids]) => ids))].slice(0, 100);
  const refs = new Map<number, IgdbRef>();
  if (wanted.length > 0) {
    try {
      const rows = await igdbQuery<IgdbRef[]>(
        env,
        "games",
        `fields name, cover.image_id, first_release_date; where id = (${wanted.join(",")}); limit 100;`,
      );
      for (const r of rows) refs.set(r.id, r);
    } catch {
      // Œuvres liées facultatives.
    }
  }
  const shown = new Set<number>();
  const related: RelatedGroup[] = groups.flatMap(([title, ids, relation]) => {
    const works: RelatedWork[] = ids
      .filter((gid) => !shown.has(gid) && refs.has(gid))
      .map((gid) => {
        shown.add(gid);
        const r = refs.get(gid)!;
        return {
          type: "game" as const,
          externalId: String(gid),
          title: r.name ?? "Sans titre",
          year: yearOf(unixToDate(r.first_release_date)),
          posterUrl: igdbImage(r.cover?.image_id, "t_cover_big"),
          relation,
        };
      })
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    return works.length > 0 ? [{ title, works }] : [];
  });

  const companies = game.involved_companies ?? [];
  const names = (pick: (c: (typeof companies)[number]) => boolean | undefined) => [
    ...new Set(companies.filter(pick).flatMap((c) => (c.company ? [c.company.name] : []))),
  ];
  const developers = names((c) => c.developer);
  const publishers = names((c) => c.publisher);
  const timeToBeat = times
    ? { hastily: toMinutes(times.hastily), normally: toMinutes(times.normally), completely: toMinutes(times.completely) }
    : null;
  const background = game.artworks?.[0] ?? game.screenshots?.[0];

  return {
    type: "game",
    externalId: String(game.id),
    title: game.name,
    originalTitle: null,
    overview: game.summary ?? null,
    posterUrl: igdbImage(game.cover?.image_id, "t_cover_big"),
    backdropUrl: igdbImage(background?.image_id, "t_1080p"),
    releaseDate: unixToDate(game.first_release_date),
    releaseLabel: "Sortie",
    runtimeMinutes: null,
    totalEpisodes: null,
    totalChapters: null,
    totalVolumes: null,
    state: null,
    isOngoing: false,
    genres: game.genres?.map((g) => g.name) ?? [],
    credits: [
      ...(developers.length > 0 ? [{ role: "Développement", names: developers }] : []),
      ...(publishers.length > 0 ? [{ role: "Édition", names: publishers }] : []),
    ],
    cast: [],
    seasons: [],
    platforms: game.platforms?.map((p) => p.name) ?? [],
    timeToBeat: timeToBeat && (timeToBeat.hastily || timeToBeat.normally || timeToBeat.completely) ? timeToBeat : null,
    nextEpisode: null,
    nextRelease: null,
    providers: null,
    related,
    links: [
      ...(game.url ? [{ label: "IGDB", url: game.url }] : []),
      { label: "Backloggd", url: `https://backloggd.com/games/${game.slug}/` },
    ],
  };
}
