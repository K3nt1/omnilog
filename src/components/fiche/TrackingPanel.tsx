"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EntryPatch, LibraryEntry } from "@/lib/entry";
import { dateLabel, STATUS_ORDER, statusLabel } from "@/lib/labels";
import type { MediaType } from "@/lib/types";
import { htmlToPlain, RichText } from "../RichText";
import { StarRating } from "./StarRating";

/** « Mon suivi » : statut, favori, note, dates, critique. Chaque changement est enregistré tout de suite. */
export function TrackingPanel({ entry, type }: { entry: LibraryEntry; type: MediaType }) {
  const router = useRouter();
  const [state, setState] = useState(entry);
  // Critique : affichée mise en forme ; le champ de modification montre sa version texte.
  const [review, setReview] = useState(htmlToPlain(entry.review ?? ""));
  const [editingReview, setEditingReview] = useState(!entry.review);
  // Données relues du serveur (après un visionnage ajouté ou supprimé, une progression…) : le panneau les reprend.
  const [fromServer, setFromServer] = useState(entry);
  if (entry !== fromServer) {
    setFromServer(entry);
    setState(entry);
    if (!editingReview) setReview(htmlToPlain(entry.review ?? ""));
  }
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function save(patch: EntryPatch) {
    const previous = state;
    setState((s) => ({ ...s, ...patch }) as LibraryEntry);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Enregistrement impossible.");
      startTransition(() => router.refresh()); // dates remplies automatiquement, journal…
    } catch (e) {
      setState(previous);
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const reviewChanged = review.trim() !== htmlToPlain(state.review ?? "");
  const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40";

  return (
    <section className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Mon suivi">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Mon suivi</h2>
        <span className="text-xs text-white/50">
          {saving ? "Enregistrement…" : error ? <span className="text-rose-400">{error}</span> : `Ajouté le ${dateLabel(state.addedAt)}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={state.status}
          onChange={(e) => save({ status: e.target.value as LibraryEntry["status"] })}
          aria-label="Statut"
          className={field}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s, type)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => save({ isFavorite: !state.isFavorite })}
          aria-pressed={state.isFavorite}
          className={`${field} ${state.isFavorite ? "border-rose-400/60 text-rose-300" : "text-white/70"} hover:bg-white/10`}
        >
          {state.isFavorite ? "♥ Favori" : "♡ Ajouter aux favoris"}
        </button>
        <StarRating value={state.rating} onChange={(rating) => save({ rating })} disabled={saving} />
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2 text-white/70">
          Début
          <input
            type="date"
            value={state.startedAt?.slice(0, 10) ?? ""}
            onChange={(e) => save({ startedAt: e.target.value || null })}
            className={field}
          />
        </label>
        <label className="flex items-center gap-2 text-white/70">
          Fin
          <input
            type="date"
            value={state.completedAt?.slice(0, 10) ?? ""}
            onChange={(e) => save({ completedAt: e.target.value || null })}
            className={field}
          />
        </label>
      </div>

      {!editingReview && state.review ? (
        <div className="mt-3 text-sm">
          <div className="mb-1 flex items-center justify-between gap-3 text-white/70">
            Critique
            <button type="button" onClick={() => setEditingReview(true)} className="text-xs text-sky-300 hover:underline">
              Modifier
            </button>
          </div>
          <RichText text={state.review} className={`text-white/85 ${expanded ? "" : "line-clamp-4"}`} />
          {state.review.length > 280 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs text-white/50 hover:text-white">
              {expanded ? "Réduire" : "Lire tout"}
            </button>
          )}
        </div>
      ) : (
        <>
          <label className="mt-3 block text-sm text-white/70">
            Critique
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={review.length > 300 ? 8 : 3}
              placeholder="Ce que tu en as pensé…"
              className={`${field} mt-1 block w-full resize-y text-white`}
            />
          </label>
          {(reviewChanged || state.review) && (
            <div className="mt-2 flex gap-2">
              {reviewChanged && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    await save({ review: review.trim() || null });
                    setEditingReview(!review.trim());
                  }}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                >
                  Enregistrer la critique
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setReview(htmlToPlain(state.review ?? ""));
                  setEditingReview(!state.review);
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:text-white"
              >
                Annuler
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
