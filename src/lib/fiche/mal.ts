// Fiche d'un animé ou d'un manga depuis MyAnimeList : studio, auteurs, œuvres liées (suites, adaptations…).
import { malGet } from "../sources/mal";
import type { MediaFiche, RelatedGroup, RelatedWork } from "./types";

interface MalRelated {
  node: { id: number; title: string; main_picture?: { medium?: string; large?: string } };
  relation_type: string;
}

interface MalFull {
  id: number;
  title: string;
  main_picture?: { medium?: string; large?: string };
  alternative_titles?: { en?: string; ja?: string };
  start_date?: string;
  synopsis?: string;
  status?: string;
  genres?: { name: string }[];
  num_episodes?: number;
  average_episode_duration?: number;
  num_chapters?: number;
  num_volumes?: number;
  studios?: { name: string }[];
  authors?: { node: { first_name?: string; last_name?: string }; role: string }[];
  serialization?: { node: { name: string } }[];
  broadcast?: { day_of_the_week?: string; start_time?: string };
  related_anime?: MalRelated[];
  related_manga?: MalRelated[];
}

const STATE: Record<string, string> = {
  currently_airing: "En diffusion",
  finished_airing: "Terminé",
  not_yet_aired: "Pas encore diffusé",
  currently_publishing: "En publication",
  finished: "Terminé",
  not_yet_published: "Pas encore publié",
  on_hiatus: "En pause (hiatus)",
  discontinued: "Arrêté",
};

const RELATION: Record<string, string> = {
  sequel: "Suite",
  prequel: "Préquelle",
  parent_story: "Histoire principale",
  side_story: "Histoire parallèle",
  full_story: "Version intégrale",
  summary: "Résumé",
  alternative_setting: "Univers alternatif",
  alternative_version: "Version alternative",
  spin_off: "Spin-off",
  adaptation: "Adaptation",
  character: "Personnages communs",
  other: "Autre",
};

const DAYS: Record<string, string> = {
  monday: "lundi",
  tuesday: "mardi",
  wednesday: "mercredi",
  thursday: "jeudi",
  friday: "vendredi",
  saturday: "samedi",
  sunday: "dimanche",
};

const ROLE: Record<string, string> = { Story: "Scénario", Art: "Dessin", "Story & Art": "Scénario et dessin" };

const positiveOrNull = (value: number | undefined) => (value && value > 0 ? value : null);

export async function getMalFiche(clientId: string, kind: "anime" | "manga", id: string): Promise<MediaFiche> {
  const common = "alternative_titles,start_date,synopsis,status,genres,related_anime,related_manga";
  const fields =
    kind === "anime"
      ? `${common},num_episodes,average_episode_duration,studios,broadcast`
      : `${common},num_chapters,num_volumes,authors{first_name,last_name},serialization{name}`;
  const d = await malGet<MalFull>(clientId, `/${kind}/${Number(id)}`, { fields });
  const english = d.alternative_titles?.en;

  const toWork = (r: MalRelated, type: "anime" | "manga"): RelatedWork => ({
    type,
    externalId: String(r.node.id),
    title: r.node.title,
    year: null,
    posterUrl: r.node.main_picture?.large ?? r.node.main_picture?.medium ?? null,
    relation: RELATION[r.relation_type] ?? r.relation_type,
  });
  const all = [
    ...(d.related_anime ?? []).map((r) => ({ r, work: toWork(r, "anime") })),
    ...(d.related_manga ?? []).map((r) => ({ r, work: toWork(r, "manga") })),
  ];
  const story = new Set(["sequel", "prequel", "parent_story", "full_story"]);
  const groups: [string, (x: (typeof all)[number]) => boolean][] = [
    ["Suites et préquelles", (x) => story.has(x.r.relation_type) && x.work.type === kind],
    ["Adaptations", (x) => x.r.relation_type === "adaptation" || x.work.type !== kind],
    ["Autres œuvres liées", () => true],
  ];
  const used = new Set<(typeof all)[number]>();
  const related: RelatedGroup[] = groups.flatMap(([title, match]) => {
    const works = all.filter((x) => !used.has(x) && match(x));
    works.forEach((x) => used.add(x));
    return works.length > 0 ? [{ title, works: works.map((x) => x.work) }] : [];
  });

  const authors = new Map<string, string[]>();
  for (const a of d.authors ?? []) {
    const role = ROLE[a.role] ?? a.role;
    const name = [a.node.first_name, a.node.last_name].filter(Boolean).join(" ");
    if (name) authors.set(role, [...(authors.get(role) ?? []), name]);
  }
  const studios = (d.studios ?? []).map((s) => s.name);
  const magazines = (d.serialization ?? []).map((s) => s.node.name);
  const broadcast = d.broadcast?.day_of_the_week && d.status === "currently_airing"
    ? {
        label: `Chaque ${DAYS[d.broadcast.day_of_the_week] ?? d.broadcast.day_of_the_week}${d.broadcast.start_time ? ` à ${d.broadcast.start_time} (heure du Japon)` : ""}`,
        date: null,
      }
    : null;

  return {
    type: kind,
    externalId: String(d.id),
    title: d.title,
    originalTitle: english && english !== d.title ? english : null,
    overview: d.synopsis ?? null,
    posterUrl: d.main_picture?.large ?? d.main_picture?.medium ?? null,
    backdropUrl: null,
    releaseDate: d.start_date ?? null,
    releaseLabel: kind === "anime" ? "Première diffusion" : "Début de publication",
    runtimeMinutes: d.average_episode_duration ? Math.round(d.average_episode_duration / 60) : null,
    totalEpisodes: positiveOrNull(d.num_episodes),
    totalChapters: positiveOrNull(d.num_chapters),
    totalVolumes: positiveOrNull(d.num_volumes),
    state: d.status ? (STATE[d.status] ?? null) : null,
    isOngoing: d.status === "currently_airing" || d.status === "currently_publishing",
    genres: d.genres?.map((g) => g.name) ?? [],
    credits: [
      ...(studios.length > 0 ? [{ role: studios.length > 1 ? "Studios" : "Studio", names: studios }] : []),
      ...[...authors].map(([role, names]) => ({ role, names })),
      ...(magazines.length > 0 ? [{ role: "Prépublication", names: magazines }] : []),
    ],
    cast: [],
    seasons: [],
    platforms: [],
    timeToBeat: null,
    nextEpisode: broadcast,
    providers: null,
    related,
    links: [{ label: "MyAnimeList", url: `https://myanimelist.net/${kind}/${d.id}` }],
  };
}
