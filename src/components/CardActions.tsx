"use client";

import { useState } from "react";
import type { LibraryCard } from "@/lib/browse-shared";
import { STATUS_ORDER, statusLabel } from "@/lib/labels";
import type { LibraryStatus } from "@/lib/types";
import { StarRating } from "./fiche/StarRating";
import { useAction } from "./useAction";

/**
 * Actions rapides sur une vignette : ♥, épisode / chapitre suivant, focus, statut, note.
 * Le bouton « ⋯ » apparaît au survol (ordinateur) et reste visible sur écran tactile.
 */
export function CardActions({ card }: { card: LibraryCard }) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const patch = (id: string, body: Record<string, unknown>) => run(id, `/api/library/${card.entryId}`, body, "PATCH");
  const step =
    card.status !== "completed" && (card.type === "tv" || card.type === "anime" || card.type === "manga")
      ? { kind: card.type === "manga" ? "chapter" : "episode", label: card.type === "manga" ? "+1 chapitre" : "+1 épisode" }
      : null;
  const item = "w-full rounded-md bg-white/10 px-2 py-1.5 text-left text-xs hover:bg-white/20 disabled:opacity-50";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Actions rapides : ${card.title}`}
        className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/75 px-2 py-0.5 text-sm leading-none opacity-0 transition group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
      >
        ⋯
      </button>
    );
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col gap-1.5 overflow-y-auto rounded-lg bg-black/90 p-2 ring-1 ring-white/20"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-xs font-medium">{card.title}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="px-1 text-sm text-white/70 hover:text-white">
          ✕
        </button>
      </div>
      <button type="button" disabled={busy !== null} onClick={() => patch("fav", { isFavorite: !card.isFavorite })} className={item}>
        {card.isFavorite ? "♥ Retirer des favoris" : "♡ Favori"}
      </button>
      {step && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("step", `/api/library/${card.entryId}/progress`, { kind: step.kind })}
          className={item}
        >
          {busy === "step" ? "…" : step.label}
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run("focus", `/api/library/${card.entryId}/focus`, { focus: !card.isFocus })}
        className={item}
      >
        {card.isFocus ? "🎯 Retirer le focus" : "🎯 Mettre en focus"}
      </button>
      <select
        value={card.status}
        disabled={busy !== null}
        onChange={(e) => patch("status", { status: e.target.value as LibraryStatus })}
        aria-label="Statut"
        className="w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-xs"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s, card.type)}
          </option>
        ))}
      </select>
      <div className="flex justify-center">
        <StarRating small value={card.rating} onChange={(rating) => patch("rating", { rating })} disabled={busy !== null} />
      </div>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
