"use client";

import { useState } from "react";
import type { JournalLine } from "@/lib/entry";
import { dateLabel, durationLabel, episodeName, starsLabel } from "@/lib/labels";
import type { MediaType } from "@/lib/types";
import { htmlToPlain, RichText } from "../RichText";
import { useAction } from "../useAction";
import { StarRating } from "./StarRating";

const VERB: Record<MediaType, string> = { movie: "Vu", tv: "Vu", anime: "Vu", manga: "Lu", game: "Joué" };
const AGAIN: Record<MediaType, string> = { movie: "revu", tv: "revue", anime: "revu", manga: "relu", game: "rejoué" };
const pad = (n: number) => String(n).padStart(2, "0");
const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40";

function what(line: JournalLine, titles: (string | null)[]): string | null {
  if (line.kind === "episode") {
    const number = line.episode !== null ? (line.season !== null ? `S${pad(line.season)}E${pad(line.episode)}` : `Ép. ${line.episode}`) : null;
    const name = line.note ? episodeName(line.note, titles) : null;
    return [number, name].filter(Boolean).join(" · ") || null;
  }
  if (line.kind === "chapter" && line.chapter !== null) return `Ch. ${line.chapter.toLocaleString("fr-FR")}`;
  if (line.kind === "volume" && line.volume !== null)
    return `Tome ${line.volume}${line.chapter !== null ? ` · jusqu'au ch. ${line.chapter.toLocaleString("fr-FR")}` : ""}`;
  if (line.kind === "session") return line.minutes ? durationLabel(line.minutes) : null;
  return null;
}

/** Formulaire commun : date, note, critique, tags. */
function LineForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
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
  const [tags, setTags] = useState(initial.tags.join(", "));
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
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, séparés par des virgules (vo, cinéma…)" className={`${field} w-full`} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              date: date || null,
              rating,
              review: review.trim() || null,
              tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
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

/** « Mon journal » : chaque visionnage, modifiable et supprimable ; ajout d'un visionnage complet (revu, relu…). */
export function Journal({
  lines,
  type,
  entryId,
  titles,
}: {
  lines: JournalLine[];
  type: MediaType;
  entryId: number | null;
  titles: (string | null)[];
}) {
  const { run, busy, error } = useAction();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  if (lines.length === 0 && entryId === null) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Mon journal ({lines.length})</h2>
        {entryId !== null && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            + {type === "movie" ? "Ajouter un visionnage" : `${AGAIN[type].charAt(0).toUpperCase()}${AGAIN[type].slice(1)} en entier`}
          </button>
        )}
      </div>
      {adding && entryId !== null && (
        <div className="mb-3">
          <LineForm
            initial={{ date: today, rating: null, review: "", tags: [] }}
            submitLabel={type === "movie" ? "Ajouter au journal" : `Ajouter (${AGAIN[type]} le…)`}
            busy={busy === "add"}
            onSubmit={async (v) => {
              if (await run("add", `/api/library/${entryId}/journal`, v)) setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {lines.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10">
          {lines.map((line) => {
            const detail = what(line, titles);
            return (
              <li key={line.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {line.undated
                      ? `${line.kind === "complete" ? "Terminé" : VERB[type]} · ajouté le ${dateLabel(line.at)}`
                      : `${line.kind === "session" ? "Session du" : line.kind === "complete" ? "Terminé le" : `${VERB[type]} le`} ${dateLabel(line.at)}`}
                  </span>
                  {detail && <span className="text-sky-300">{detail}</span>}
                  {line.rating !== null && <span className="text-amber-300">★ {starsLabel(line.rating)}</span>}
                  {editing !== line.id && (
                    <span className="ml-auto flex gap-3 text-xs">
                      <button type="button" onClick={() => setEditing(line.id)} className="text-sky-300 hover:underline">
                        Modifier
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          if (confirm("Supprimer cette ligne du journal ?")) run(`del-${line.id}`, `/api/journal/${line.id}`, null, "DELETE");
                        }}
                        className="text-white/50 hover:text-rose-300"
                      >
                        {busy === `del-${line.id}` ? "…" : "Supprimer"}
                      </button>
                    </span>
                  )}
                </div>
                {editing === line.id ? (
                  <LineForm
                    initial={{ date: line.undated ? "" : line.at.slice(0, 10), rating: line.rating, review: line.review ? htmlToPlain(line.review) : "", tags: line.tags }}
                    submitLabel="Enregistrer"
                    busy={busy === `edit-${line.id}`}
                    onSubmit={async (v) => {
                      if (await run(`edit-${line.id}`, `/api/journal/${line.id}`, v, "PATCH")) setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    {line.kind === "session" && line.note && <p className="text-white/70">Où j&apos;en suis : {line.note}</p>}
                    {line.review && <RichText text={line.review} className="text-white/80" />}
                    {line.tags.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {line.tags.map((t) => (
                          <li key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70">
                            #{t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </section>
  );
}
