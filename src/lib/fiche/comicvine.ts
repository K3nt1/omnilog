// Fiche d'une série de comics depuis Comic Vine : éditeur, début de publication, nombre de numéros.
// La liste des numéros se charge à part (/api/fiche/comics/:id/numeros), seulement quand on l'ouvre.
import { comicRelease, getComicVineVolume, isOngoing, lastIssueNumber, overviewOf, posterOf } from "../sources/comicvine";
import { yearOf } from "../types";
import type { MediaFiche } from "./types";

export async function getComicVineFiche(key: string | undefined, id: string): Promise<MediaFiche> {
  const { volume, recent } = await getComicVineVolume(key, id);
  const startYear = yearOf(volume.start_year);
  const ongoing = isOngoing(recent);
  return {
    type: "comic",
    externalId: String(volume.id),
    title: volume.name,
    originalTitle: null,
    overview: overviewOf(volume),
    posterUrl: posterOf(volume.image),
    backdropUrl: null,
    releaseDate: startYear ? `${startYear}-01-01` : null,
    releaseLabel: "Début de publication",
    runtimeMinutes: null,
    totalEpisodes: null,
    totalChapters: lastIssueNumber(volume, recent),
    totalVolumes: null,
    state: ongoing ? "En cours de publication" : "Terminée",
    isOngoing: ongoing,
    genres: [],
    credits: volume.publisher?.name ? [{ role: "Éditeur", names: [volume.publisher.name] }] : [],
    cast: [],
    seasons: [],
    platforms: [],
    timeToBeat: null,
    nextEpisode: null,
    nextRelease: ongoing ? comicRelease(recent) : null,
    providers: null,
    related: [],
    // Lien vers Comic Vine demandé par ses conditions d'utilisation.
    links: [{ label: "Comic Vine", url: volume.site_detail_url ?? `https://comicvine.gamespot.com/volume/4050-${volume.id}/` }],
  };
}
