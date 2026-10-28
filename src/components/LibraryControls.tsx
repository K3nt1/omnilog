"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Facet, LibraryQuery, RatingFilter, SortKey } from "@/lib/browse-shared";
import { libraryHref } from "@/lib/library-url";

const SORT_LABELS: Record<SortKey, string> = {
  activite: "Dernière activité",
  ajout: "Date d'ajout",
  note: "Ma note",
  titre: "Titre",
  sortie: "Année de sortie",
  fin: "Date de fin",
  duree: "Durée",
  visionnages: "Nombre de visionnages (2 et +)",
};

/** « Nombre de visionnages », « de lectures », « de parties » selon le type. */
function repeatLabel(type: LibraryQuery["type"]): string {
  if (type === "manga") return "Nombre de lectures (2 et +)";
  if (type === "game") return "Nombre de parties (2 et +)";
  if (type === null) return "Vu / lu / joué 2 fois et +";
  return "Nombre de visionnages (2 et +)";
}

const RATING_LABELS: Record<RatingFilter, string> = {
  "5": "★★★★★ uniquement",
  "4": "★★★★ et plus",
  "3": "★★★ et plus",
  "2": "★★ et plus",
  "1": "★ et plus",
  aucune: "Pas encore noté",
};

interface Props {
  basePath: string;
  query: LibraryQuery;
  fixedType: boolean;
  sorts: SortKey[];
  /** Libellé de « Durée » selon le type (minutes, épisodes, chapitres…). */
  durationLabel: string;
  genres: { label: string; count: number }[];
  releaseYears: Facet[];
  watchYears: Facet[];
  tags: Facet[];
  platforms: Facet[];
}

/** « Vu en », « Lu en », « Joué en » selon le type. */
function watchYearLabel(type: LibraryQuery["type"]): string {
  if (type === "manga") return "Lu en";
  if (type === "game") return "Joué en";
  if (type === null) return "Vu / lu / joué en";
  return "Vu en";
}

const nf = new Intl.NumberFormat("fr-FR");

/** Années de sortie → décennies (« 1970 » → 123 œuvres), de la plus récente à la plus ancienne. */
function decadesOf(years: Facet[]): { decade: number; count: number }[] {
  const map = new Map<number, number>();
  for (const y of years) {
    const decade = Math.floor(Number(y.value) / 10) * 10;
    if (Number.isFinite(decade)) map.set(decade, (map.get(decade) ?? 0) + y.count);
  }
  return [...map].map(([decade, count]) => ({ decade, count })).sort((a, b) => b.decade - a.decade);
}

/** Recherche, note, tri : met à jour l'adresse, la page se recharge côté serveur avec les nouveaux filtres. */
export function LibraryControls({
  basePath,
  query,
  fixedType,
  sorts,
  durationLabel,
  genres = [],
  releaseYears = [],
  watchYears = [],
  tags = [],
  platforms = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search);
  // Dernière recherche envoyée dans l'adresse, et dernière valeur de l'adresse vue.
  const [pushed, setPushed] = useState(query.search);
  const [seen, setSeen] = useState(query.search);

  // L'adresse a changé sans passer par ce champ (« Effacer les filtres », bouton retour) : on recopie sa valeur.
  if (query.search !== seen) {
    setSeen(query.search);
    if (query.search !== pushed) {
      setSearch(query.search);
      setPushed(query.search);
    }
  }

  const go = (change: Partial<LibraryQuery>) =>
    startTransition(() => router.push(libraryHref(basePath, query, change, fixedType), { scroll: false }));

  // Recherche automatique 400 ms après la dernière frappe.
  useEffect(() => {
    const wanted = search.trim();
    if (wanted === pushed) return;
    const timer = setTimeout(() => {
      setPushed(wanted);
      startTransition(() => router.push(libraryHref(basePath, query, { search: wanted }, fixedType), { scroll: false }));
    }, 400);
    return () => clearTimeout(timer);
  }, [search, pushed, basePath, query, fixedType, router]);

  const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40";
  const decades = decadesOf(releaseYears);
  const yearsOfDecade = query.decade
    ? releaseYears
        .filter((y) => Math.floor(Number(y.value) / 10) * 10 === query.decade)
        .sort((a, b) => a.value.localeCompare(b.value))
    : [];
  /** Garde la valeur choisie dans le menu même si plus aucune œuvre ne la porte avec les autres filtres. */
  const withCurrent = (facets: Facet[], current: string | null) =>
    current && !facets.some((f) => f.value === current) ? [{ value: current, count: 0 }, ...facets] : facets;

  return (
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Chercher un titre (français ou original)…"
        aria-label="Chercher dans la bibliothèque"
        className={`${field} min-w-56 flex-1`}
      />
      <select
        value={query.genre ?? ""}
        onChange={(e) => go({ genre: e.target.value || null })}
        aria-label="Filtrer par genre"
        className={field}
      >
        <option value="">Tous les genres</option>
        {query.genre && !genres.some((g) => g.label === query.genre) && <option value={query.genre}>{query.genre}</option>}
        {genres.map((g) => (
          <option key={g.label} value={g.label}>
            {g.label} ({g.count})
          </option>
        ))}
      </select>
      <select
        value={query.decade ?? ""}
        onChange={(e) => go({ decade: e.target.value ? Number(e.target.value) : null, year: null })}
        aria-label="Filtrer par décennie de sortie"
        className={field}
      >
        <option value="">Toutes les décennies</option>
        {query.decade && !decades.some((d) => d.decade === query.decade) && <option value={query.decade}>Années {query.decade}</option>}
        {decades.map((d) => (
          <option key={d.decade} value={d.decade}>
            Années {d.decade} ({nf.format(d.count)})
          </option>
        ))}
      </select>
      {query.decade && (
        <select
          value={query.year ?? ""}
          onChange={(e) => go({ year: e.target.value ? Number(e.target.value) : null })}
          aria-label="Filtrer par année de sortie"
          className={field}
        >
          <option value="">Toute la décennie</option>
          {withCurrent(yearsOfDecade, query.year ? String(query.year) : null).map((y) => (
            <option key={y.value} value={y.value}>
              {y.value} ({nf.format(y.count)})
            </option>
          ))}
        </select>
      )}
      <select
        value={query.watchYear ?? ""}
        onChange={(e) => go({ watchYear: e.target.value ? Number(e.target.value) : null })}
        aria-label="Filtrer par année de visionnage"
        className={field}
      >
        <option value="">{watchYearLabel(query.type)} : toutes</option>
        {withCurrent(watchYears, query.watchYear ? String(query.watchYear) : null).map((y) => (
          <option key={y.value} value={y.value}>
            {watchYearLabel(query.type)} {y.value} ({nf.format(y.count)})
          </option>
        ))}
      </select>
      {(tags.length > 0 || query.tag) && (
        <select value={query.tag ?? ""} onChange={(e) => go({ tag: e.target.value || null })} aria-label="Filtrer par tag" className={field}>
          <option value="">Tous les tags</option>
          {withCurrent(tags, query.tag).map((t) => (
            <option key={t.value} value={t.value}>
              #{t.value} ({nf.format(t.count)})
            </option>
          ))}
        </select>
      )}
      {query.type === "game" && (platforms.length > 0 || query.platform) && (
        <select
          value={query.platform ?? ""}
          onChange={(e) => go({ platform: e.target.value || null })}
          aria-label="Filtrer par plateforme"
          className={field}
        >
          <option value="">Toutes les plateformes</option>
          {withCurrent(platforms, query.platform).map((p) => (
            <option key={p.value} value={p.value}>
              {p.value} ({nf.format(p.count)})
            </option>
          ))}
        </select>
      )}
      <select
        value={query.rating ?? ""}
        onChange={(e) => go({ rating: (e.target.value || null) as RatingFilter | null })}
        aria-label="Filtrer par note"
        className={field}
      >
        <option value="">Toutes les notes</option>
        {(Object.keys(RATING_LABELS) as RatingFilter[]).map((r) => (
          <option key={r} value={r}>
            {RATING_LABELS[r]}
          </option>
        ))}
      </select>
      <select
        value={query.sort}
        onChange={(e) => go({ sort: e.target.value as SortKey })}
        aria-label="Trier par"
        className={field}
      >
        {sorts.map((s) => (
          <option key={s} value={s}>
            {s === "duree" ? durationLabel : s === "visionnages" ? repeatLabel(query.type) : SORT_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => go({ direction: query.direction === "asc" ? "desc" : "asc" })}
        className={`${field} hover:bg-white/10`}
        title="Inverser l'ordre"
      >
        {query.direction === "asc" ? "↑ Croissant" : "↓ Décroissant"}
      </button>
    </div>
  );
}
