import type { MetadataRoute } from "next";

/** Manifeste de l'application installable (écran d'accueil Android / iPhone, ordinateur). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Omnilog",
    short_name: "Omnilog",
    description: "Films, séries, animes, mangas et jeux : watchlists, progression et rappels.",
    lang: "fr",
    start_url: "/aujourdhui",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Aujourd'hui", url: "/aujourdhui" },
      { name: "Bibliothèque", url: "/bibliotheque" },
      { name: "Rechercher", url: "/recherche" },
    ],
  };
}
