"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { LibraryQuery, RatingFilter, SortKey } from "@/lib/browse-shared";
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
}

/** Recherche, note, tri : met à jour l'adresse, la page se recharge côté serveur avec les nouveaux filtres. */
export function LibraryControls({ basePath, query, fixedType, sorts, durationLabel }: Props) {
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
            {s === "duree" ? durationLabel : SORT_LABELS[s]}
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
