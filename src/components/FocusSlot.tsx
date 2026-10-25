"use client";

import Link from "next/link";
import type { LibraryCard } from "@/lib/browse-shared";
import { ficheHref, plannedLabel, positionLine, TYPE_SINGULAR } from "@/lib/labels";
import type { MediaType } from "@/lib/types";
import { useAction } from "./useAction";

/** Action principale proposée directement dans le bandeau, selon le type. */
const QUICK: Record<MediaType, { kind: "episode" | "chapter" | "complete"; label: string } | null> = {
  movie: { kind: "complete", label: "✓ Vu" },
  tv: { kind: "episode", label: "✓ Épisode vu" },
  anime: { kind: "episode", label: "✓ Épisode vu" },
  manga: { kind: "chapter", label: "✓ Chapitre lu" },
  game: null, // une session demande une durée : on passe par la fiche
};

/**
 * Une case du bandeau « En ce moment » : le focus du type (affiche, où on en est, action rapide),
 * ou, s'il n'y en a pas, le tirage au sort dans la watchlist / le backlog.
 */
export function FocusSlot({
  type,
  card,
  plannedCount,
  large = false,
}: {
  type: MediaType;
  card: LibraryCard | null;
  plannedCount: number;
  /** Page d'un type : une seule carte, centrée, avec la mention « En ce moment ». */
  large?: boolean;
}) {
  const { run, busy, error } = useAction();
  const draw = () => run("draw", "/api/draw", { type });
  const list = plannedLabel(type).toLowerCase();

  if (!card) {
    return (
      <div className={`flex flex-col justify-between gap-3 rounded-xl border border-dashed border-white/15 p-3 ${large ? "mx-auto w-full max-w-md sm:flex-row sm:items-center" : ""}`}>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">{TYPE_SINGULAR[type]}</p>
          <p className="text-sm text-white/60">Rien en ce moment.</p>
        </div>
        {plannedCount > 0 ? (
          <button
            type="button"
            onClick={draw}
            disabled={busy !== null}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            {busy === "draw" ? "Tirage…" : `🎲 Tirer au sort dans ma ${list}`}
          </button>
        ) : (
          <p className="text-xs text-white/40">{plannedLabel(type)} vide</p>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  const quick = QUICK[type];
  const href = ficheHref(card.type, card.externalId);
  return (
    <div className={`flex gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 ${large ? "mx-auto w-full max-w-md" : ""}`}>
      <Link href={href} className={`shrink-0 overflow-hidden rounded-md bg-white/5 ${large ? "h-28 w-[4.75rem]" : "h-24 w-16"}`}>
        {card.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.posterUrl} alt="" className="h-full w-full object-cover" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xs uppercase tracking-wide text-white/40">
          {/* Sur la bibliothèque, le titre de la section dit déjà « En ce moment » : seul le type est rappelé. */}
          {[large ? "🎯 En ce moment" : TYPE_SINGULAR[type], card.drawnAt ? "🎲 Tiré au sort" : null].filter(Boolean).join(" · ")}
        </p>
        <Link href={href} className={`line-clamp-2 font-semibold leading-tight hover:underline ${large ? "text-base" : "text-sm"}`}>
          {card.title}
        </Link>
        <p className="mt-0.5 line-clamp-1 text-xs text-sky-300">{positionLine(card)}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {quick ? (
            <button
              type="button"
              onClick={() => run("quick", `/api/library/${card.entryId}/progress`, { kind: quick.kind })}
              disabled={busy !== null}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              {busy === "quick" ? "…" : quick.label}
            </button>
          ) : (
            <Link href={`${href}#progression`} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-black hover:bg-white/90">
              + Session
            </Link>
          )}
          {card.drawnAt && (
            <button
              type="button"
              onClick={draw}
              disabled={busy !== null}
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
            >
              {busy === "draw" ? "…" : "🎲 Relancer"}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
