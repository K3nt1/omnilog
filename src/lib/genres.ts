// Genres : TMDB les donne en français, MyAnimeList et IGDB en anglais. Pour filtrer la bibliothèque
// avec une seule liste, chaque genre enregistré est ramené à un ou plusieurs libellés français.

const MAP: Record<string, string[]> = {
  // TMDB (séries) : genres doubles
  "Action & Adventure": ["Action", "Aventure"],
  "Action & Aventure": ["Action", "Aventure"],
  "Sci-Fi & Fantasy": ["Science-Fiction", "Fantastique"],
  "Science-Fiction & Fantastique": ["Science-Fiction", "Fantastique"],
  "War & Politics": ["Guerre", "Politique"],
  "Guerre & Politique": ["Guerre", "Politique"],
  Kids: ["Enfants"],
  News: ["Information"],
  Reality: ["Téléréalité"],
  Talk: ["Talk-show"],
  // MyAnimeList
  Adventure: ["Aventure"],
  Comedy: ["Comédie"],
  Drama: ["Drame"],
  Fantasy: ["Fantastique"],
  Horror: ["Horreur"],
  Mystery: ["Mystère"],
  "Sci-Fi": ["Science-Fiction"],
  "Slice of Life": ["Tranche de vie"],
  Sports: ["Sport"],
  Supernatural: ["Surnaturel"],
  "Avant Garde": ["Avant-garde"],
  "Award Winning": ["Primé"],
  Gourmet: ["Cuisine"],
  Historical: ["Histoire"],
  Military: ["Guerre"],
  Music: ["Musique"],
  Psychological: ["Psychologique"],
  School: ["École"],
  Space: ["Espace"],
  "Martial Arts": ["Arts martiaux"],
  "Super Power": ["Super-pouvoirs"],
  Detective: ["Policier"],
  "Team Sports": ["Sport"],
  "Combat Sports": ["Sport"],
  Workplace: ["Monde du travail"],
  Romance: ["Romance"],
  // IGDB
  "Role-playing (RPG)": ["RPG"],
  Shooter: ["Tir"],
  Platform: ["Plateforme"],
  Puzzle: ["Réflexion"],
  Strategy: ["Stratégie"],
  "Real Time Strategy (RTS)": ["Stratégie"],
  "Turn-based strategy (TBS)": ["Stratégie"],
  Tactical: ["Tactique"],
  Fighting: ["Combat"],
  Racing: ["Course"],
  Sport: ["Sport"],
  Simulator: ["Simulation"],
  "Hack and slash/Beat 'em up": ["Beat'em all"],
  "Card & Board Game": ["Cartes et plateau"],
  "Point-and-click": ["Point & click"],
  "Quiz/Trivia": ["Quiz"],
  "Visual Novel": ["Visual novel"],
  Indie: ["Indépendant"],
};

/** Libellés français d'un genre enregistré (« Sci-Fi » → « Science-Fiction »). Inconnu : gardé tel quel. */
export function genreLabels(raw: string): string[] {
  return MAP[raw] ?? [raw];
}

/** Toutes les valeurs enregistrées qui correspondent à un libellé (pour la requête SQL du filtre). */
export function rawGenresFor(label: string): string[] {
  const raws = Object.entries(MAP)
    .filter(([, labels]) => labels.includes(label))
    .map(([raw]) => raw);
  return [...new Set([label, ...raws])];
}

/** Regroupe les genres enregistrés (avec leur nombre d'œuvres) par libellé français, triés A→Z. */
export function groupGenres(rows: { genre: string; n: number }[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { genre, n } of rows) {
    for (const label of genreLabels(genre)) counts.set(label, (counts.get(label) ?? 0) + n);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
