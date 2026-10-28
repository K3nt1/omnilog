"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { VIEW_COOKIE, type LibraryCard, type PosterSize, type SortKey, type ViewPrefs } from "@/lib/browse-shared";
import { sortDetail, STATUS_ORDER, statusLabel } from "@/lib/labels";
import type { LibraryStatus, MediaType } from "@/lib/types";
import { MediaCard } from "./MediaCard";
import { MediaRow } from "./MediaRow";
import { useAction } from "./useAction";

const GRID: Record<PosterSize, string> = {
  petite: "grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12",
  moyenne: "grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  grande: "grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
};

const SIZE_LABELS: Record<PosterSize, string> = { petite: "Petites", moyenne: "Moyennes", grande: "Grandes" };

interface Props {
  cards: LibraryCard[];
  prefs: ViewPrefs;
  showType: boolean;
  sort: SortKey;
  /** Type affiché (libellés des statuts) ; null si la page mélange les types. */
  type: MediaType | null;
}

/**
 * Résultats de la bibliothèque : grille (3 tailles) ou liste, et sélection multiple
 * pour changer le statut ou les favoris de plusieurs œuvres d'un coup.
 */
export function LibraryResults({ cards, prefs, showType, sort, type }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { run, busy, error } = useAction();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // L'affichage est mémorisé dans un cookie (un an), relu par la page côté serveur (taille de page).
  function setPrefs(next: Partial<ViewPrefs>) {
    const value = { ...prefs, ...next };
    document.cookie = `${VIEW_COOKIE}=${value.view}-${value.size}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // La sélection reste quand on change de page : on peut choisir des œuvres sur plusieurs pages.
  const allOnPage = cards.length > 0 && cards.every((c) => selected.has(c.entryId));
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  // Libellés des statuts : ceux du type affiché, sinon communs (« Watchlist / Backlog »).
  const labelType = type;

  async function apply(id: string, body: { status?: LibraryStatus; isFavorite?: boolean }) {
    if (await run(id, "/api/library/bulk", { entryIds: [...selected], ...body })) stop();
  }

  const button = "rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10";
  const toggleOn = "border-white bg-white text-black hover:bg-white/90";

  return (
    <div className={`space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/15 text-sm" role="group" aria-label="Affichage">
          <button
            type="button"
            onClick={() => setPrefs({ view: "grille" })}
            aria-pressed={prefs.view === "grille"}
            className={`px-3 py-1.5 ${prefs.view === "grille" ? "bg-white text-black" : "hover:bg-white/10"}`}
          >
            ▦ Grille
          </button>
          <button
            type="button"
            onClick={() => setPrefs({ view: "liste" })}
            aria-pressed={prefs.view === "liste"}
            className={`px-3 py-1.5 ${prefs.view === "liste" ? "bg-white text-black" : "hover:bg-white/10"}`}
          >
            ☰ Liste
          </button>
        </div>
        {prefs.view === "grille" && (
          <select
            value={prefs.size}
            onChange={(e) => setPrefs({ size: e.target.value as PosterSize })}
            aria-label="Taille des affiches"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
          >
            {(Object.keys(SIZE_LABELS) as PosterSize[]).map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]} affiches
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {selecting && (
            <button
              type="button"
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  for (const c of cards) {
                    if (allOnPage) next.delete(c.entryId);
                    else next.add(c.entryId);
                  }
                  return next;
                })
              }
              className={button}
            >
              {allOnPage ? "Désélectionner la page" : "Sélectionner la page"}
            </button>
          )}
          <button type="button" onClick={() => (selecting ? stop() : setSelecting(true))} className={`${button} ${selecting ? toggleOn : ""}`}>
            {selecting ? "Terminer la sélection" : "☑ Sélectionner"}
          </button>
        </div>
      </div>

      {prefs.view === "liste" ? (
        <ul className="divide-y divide-white/5">
          {cards.map((card) => (
            <li key={card.entryId} className="relative">
              <MediaRow card={card} showType={showType} detail={sortDetail(sort, card.type, card.sortValue)} actions={!selecting} />
              {selecting && <SelectOverlay checked={selected.has(card.entryId)} title={card.title} onToggle={() => toggle(card.entryId)} row />}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={`grid ${GRID[prefs.size]}`}>
          {cards.map((card) => (
            <li key={card.entryId} className="relative">
              <MediaCard
                card={card}
                showType={showType}
                compact={prefs.size === "petite"}
                actions={!selecting && prefs.size !== "petite"}
                detail={prefs.size === "petite" ? null : sortDetail(sort, card.type, card.sortValue)}
              />
              {selecting && <SelectOverlay checked={selected.has(card.entryId)} title={card.title} onToggle={() => toggle(card.entryId)} />}
            </li>
          ))}
        </ul>
      )}

      {selecting && (
        <div className="sticky bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-neutral-900/95 p-3 shadow-2xl ring-1 ring-white/20 backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <select
            value=""
            disabled={selected.size === 0 || busy !== null}
            onChange={(e) => e.target.value && apply("status", { status: e.target.value as LibraryStatus })}
            aria-label="Changer le statut de la sélection"
            className="rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">{busy === "status" ? "…" : "Changer le statut…"}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, labelType)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selected.size === 0 || busy !== null}
            onClick={() => apply("fav", { isFavorite: true })}
            className={`${button} disabled:opacity-50`}
          >
            {busy === "fav" ? "…" : "♥ Favoris"}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || busy !== null}
            onClick={() => apply("unfav", { isFavorite: false })}
            className={`${button} disabled:opacity-50`}
          >
            {busy === "unfav" ? "…" : "♡ Retirer des favoris"}
          </button>
          {error && <p className="w-full text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Calque cliquable posé sur une vignette ou une ligne en mode sélection. */
function SelectOverlay({ checked, title, onToggle, row = false }: { checked: boolean; title: string; onToggle: () => void; row?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Sélectionner ${title}`}
      onClick={onToggle}
      className={`absolute inset-0 z-20 flex rounded-lg transition ${
        checked ? "bg-sky-400/20 ring-2 ring-sky-400" : "hover:bg-white/5"
      } ${row ? "items-center justify-end pr-3" : "items-start justify-end p-1.5"}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
          checked ? "border-sky-400 bg-sky-400 text-black" : "border-white/60 bg-black/60"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}
