"use client";

import { useState } from "react";
import { BUILTIN_SORT, DEFAULT_DIRECTION, repeatLabel, SORT_LABELS, sortsFor, type DefaultSorts, type SortChoice, type SortKey } from "@/lib/browse-shared";
import { TYPE_LABELS } from "@/lib/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";
import { useAction } from "../useAction";

const field = "rounded-lg border border-white/15 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-white/40";
const PAGES: (MediaType | "all")[] = ["all", ...MEDIA_TYPES];

const sortLabel = (sort: SortKey, type: MediaType | null) => (sort === "visionnages" ? repeatLabel(type) : SORT_LABELS[sort]);

/** Tri appliqué à l'ouverture de la bibliothèque et de chaque page de type (tant que l'adresse n'en choisit pas un autre). */
export function SortSettings({ defaultSorts }: { defaultSorts: DefaultSorts }) {
  const { run, busy, error } = useAction();
  const [sorts, setSorts] = useState<DefaultSorts>(defaultSorts);

  function change(page: MediaType | "all", choice: SortChoice) {
    const next = { ...sorts };
    if (choice.sort === BUILTIN_SORT.sort && choice.direction === BUILTIN_SORT.direction) delete next[page];
    else next[page] = choice;
    setSorts(next);
    void run(page, "/api/settings", { defaultSorts: next }, "PATCH");
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-white/50">Tri à l&apos;ouverture de chaque page ; tu peux toujours en changer depuis la page.</p>
      <ul className="divide-y divide-white/10">
        {PAGES.map((page) => {
          const type = page === "all" ? null : page;
          const current = sorts[page] ?? BUILTIN_SORT;
          return (
            <li key={page} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{page === "all" ? "Bibliothèque" : TYPE_LABELS[page]}</span>
              <span className="flex gap-2">
                <select
                  value={current.sort}
                  disabled={busy !== null}
                  onChange={(e) => {
                    const sort = e.target.value as SortKey;
                    change(page, { sort, direction: DEFAULT_DIRECTION[sort] });
                  }}
                  aria-label={`Tri par défaut : ${page === "all" ? "bibliothèque" : TYPE_LABELS[page]}`}
                  className={field}
                >
                  {sortsFor(type).map((s) => (
                    <option key={s} value={s}>
                      {sortLabel(s, type)}
                    </option>
                  ))}
                </select>
                <select
                  value={current.direction}
                  disabled={busy !== null}
                  onChange={(e) => change(page, { sort: current.sort, direction: e.target.value as SortChoice["direction"] })}
                  aria-label="Ordre"
                  className={field}
                >
                  <option value="desc">↓ Décroissant</option>
                  <option value="asc">↑ Croissant</option>
                </select>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}
