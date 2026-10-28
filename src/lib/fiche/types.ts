import type { ReleaseInfo } from "../release-shared";
// Fiche d'une œuvre telle qu'affichée sur /oeuvre/… : demandée en direct à la source (TMDB, MAL, IGDB),
// jamais stockée en base (acteurs, plateformes, œuvres liées… changent et pèseraient des milliers d'écritures).
import type { MediaType, SeasonInfo } from "../types";

export interface FichePerson {
  name: string;
  /** Personnage (acteurs) ou rôle précis. */
  detail: string | null;
  photoUrl: string | null;
}

/** Une ligne de crédits : « Réalisation : Denis Villeneuve ». */
export interface FicheCredit {
  role: string;
  names: string[];
}

export interface FicheProvider {
  name: string;
  logoUrl: string | null;
}

/** Où regarder (JustWatch via TMDB) pour la région de l'utilisateur. */
export interface FicheProviders {
  region: string;
  /** Page TMDB qui liste les offres (attribution JustWatch). */
  link: string | null;
  stream: FicheProvider[];
  free: FicheProvider[];
  rent: FicheProvider[];
  buy: FicheProvider[];
}

/** Œuvre liée (même saga, suite, adaptation, DLC…), ouvrable même si elle n'est pas dans la bibliothèque. */
export interface RelatedWork {
  type: MediaType;
  externalId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  /** Lien avec l'œuvre affichée : « Suite », « Adaptation », « DLC »… */
  relation: string | null;
}

export interface RelatedGroup {
  title: string;
  works: RelatedWork[];
}

export interface FicheLink {
  label: string;
  url: string;
}

export interface MediaFiche {
  type: MediaType;
  externalId: string;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  /** « Sortie », « Première diffusion », « Début de publication »… */
  releaseLabel: string;
  /** Film : durée ; série / anime : durée d'un épisode (minutes). */
  runtimeMinutes: number | null;
  totalEpisodes: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  /** État de l'œuvre : « En diffusion », « Terminée », « En publication »… */
  state: string | null;
  isOngoing: boolean;
  genres: string[];
  credits: FicheCredit[];
  cast: FichePerson[];
  seasons: SeasonInfo[];
  /** Jeux : plateformes. */
  platforms: string[];
  /** Jeux : durée de vie en minutes (IGDB). */
  timeToBeat: { hastily: number | null; normally: number | null; completely: number | null } | null;
  /** Prochain épisode annoncé (séries TMDB) ou jour de diffusion (animes MAL). */
  nextEpisode: { label: string; date: string | null } | null;
  /** Prochain épisode daté, connu directement par la source (séries TMDB) ; complété ensuite par release.ts. */
  nextRelease: ReleaseInfo | null;
  providers: FicheProviders | null;
  related: RelatedGroup[];
  links: FicheLink[];
}

/** Épisode d'une saison tel que renvoyé par /api/fiche/tv/:id/saison/:n. */
export interface SeasonEpisodeResponse {
  number: number;
  name: string;
  overview: string | null;
  stillUrl: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  /** Ton visionnage le plus récent de cet épisode, sinon null. */
  watched: { logId: number; at: string; rating: number | null; review: string | null; count: number } | null;
}
