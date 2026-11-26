"use client";

import { useState } from "react";
import { StarRating } from "./StarRating";
import { TagInput } from "./TagInput";

const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40";

/** Formulaire commun : date, note, critique, tags (sans tags pour une saison). */
export function LineForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  knownTags,
  withTags = true,
}: {
  knownTags: string[];
  withTags?: boolean;
  initial: { date: string; rating: number | null; review: string; tags: string[] };
  submitLabel: string;
  busy: boolean;
  /** date = null : sans date (le visionnage est daté du jour de l'ajout, comme sur Letterboxd). */
  onSubmit: (v: { date: string | null; rating: number | null; review: string | null; tags: string[] }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [rating, setRating] = useState(initial.rating);
  const [review, setReview] = useState(initial.review);
  const [tags, setTags] = useState(initial.tags);
  return (
    <div className="space-y-2 rounded-lg bg-black/30 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Date du visionnage" />
        {date ? (
          <button type="button" onClick={() => setDate("")} className="text-xs text-white/50 hover:text-white">
            Sans date
          </button>
        ) : (
          <span className="text-xs text-white/50">Sans date : enregistré à la date d&apos;aujourd&apos;hui</span>
        )}
        <StarRating value={rating} onChange={setRating} />
      </div>
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={3}
        placeholder="Critique (facultatif)"
        className={`${field} block w-full`}
      />
      {withTags && <TagInput value={tags} onChange={setTags} known={knownTags} />}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              date: date || null,
              rating,
              review: review.trim() || null,
              tags,
            })
          }
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          {busy ? "…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:text-white">
          Annuler
        </button>
      </div>
    </div>
  );
}
