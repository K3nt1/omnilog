// Nouveautés : types et libellés, utilisables côté serveur comme côté navigateur.
import type { MediaType } from "./types";

export type NewsKind = "episode" | "season" | "sequel" | "chapter" | "dlc" | "provider";

/** Bit de chaque type dans users.news_kinds. */
export const NEWS_BITS: Record<NewsKind, number> = { episode: 1, season: 2, chapter: 4, dlc: 8, provider: 16, sequel: 32 };

export const NEWS_LABELS: Record<NewsKind, string> = {
  episode: "Nouveaux épisodes (séries, anime)",
  season: "Nouvelles saisons de séries, même terminées",
  sequel: "Suites d'anime, même terminés",
  chapter: "Nouveaux chapitres (mangas)",
  dlc: "DLC et extensions des jeux",
  provider: "Films de la watchlist arrivés sur une plateforme",
};

export const NEWS_ICONS: Record<NewsKind, string> = { episode: "📺", season: "🆕", sequel: "➡️", chapter: "📖", dlc: "🧩", provider: "🍿" };

export interface NewsItem {
  id: number;
  kind: NewsKind;
  label: string;
  detail: string | null;
  url: string;
  createdAt: string;
  seen: boolean;
  work: { title: string; type: MediaType; posterUrl: string | null };
}
