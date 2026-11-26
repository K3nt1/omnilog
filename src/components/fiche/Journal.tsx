"use client";

import Link from "next/link";
import { useState } from "react";
import type { JournalLine } from "@/lib/entry";
import { dateLabel, durationLabel, episodeName, issueLabel, starsLabel } from "@/lib/labels";
import type { MediaType } from "@/lib/types";
import { htmlToPlain, RichText } from "../RichText";
import { useAction } from "../useAction";
import type { SeasonReviewLine } from "@/lib/season-reviews";
import { LineForm } from "./LineForm";
import { SeasonReviewItem, seasonTitle } from "./SeasonReviews";

const VERB: Record<MediaType, string> = { movie: "Vu", tv: "Vu", anime: "Vu", manga: "Lu", game: "Joué", comic: "Lu" };
const AGAIN: Record<MediaType, string> = { movie: "revu", tv: "revue", anime: "revu", manga: "relu", game: "rejoué", comic: "relu" };
const pad = (n: number) => String(n).padStart(2, "0");

function what(line: JournalLine, titles: (string | null)[], type: MediaType): string | null {
  if (line.kind === "episode") {
    const number = line.episode !== null ? (line.season !== null ? `S${pad(line.season)}E${pad(line.episode)}` : `Ép. ${line.episode}`) : null;
    const name = line.note ? episodeName(line.note, titles) : null;
    return [number, name].filter(Boolean).join(" · ") || null;
  }
  if (line.kind === "chapter" && line.chapter !== null)
    return type === "comic" ? issueLabel(line.chapter) : `Ch. ${line.chapter.toLocaleString("fr-FR")}`;
  if (line.kind === "volume" && line.volume !== null)
    return `Tome ${line.volume}${line.chapter !== null ? ` · jusqu'au ch. ${line.chapter.toLocaleString("fr-FR")}` : ""}`;
  if (line.kind === "session") return line.minutes ? durationLabel(line.minutes) : null;
  return null;
}

/** « Mon journal » : chaque visionnage, modifiable et supprimable ; ajout d'un visionnage complet (revu, relu…). */
export function Journal({
  lines,
  type,
  entryId,
  titles,
  knownTags = [],
  seasonReviews = [],
  seasonNames = {},
}: {
  lines: JournalLine[];
  /** Séries : notes et critiques de saison, mêlées au journal par date. */
  seasonReviews?: SeasonReviewLine[];
  /** Nom TMDB de chaque saison (« Saison 2 · Le retour »). */
  seasonNames?: Record<number, string | null>;
  type: MediaType;
  entryId: number | null;
  titles: (string | null)[];
  /** Tes tags existants, proposés à la saisie. */
  knownTags?: string[];
}) {
  const { run, busy, error } = useAction();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const total = lines.length + seasonReviews.length;
  if (total === 0 && entryId === null) return null;
  // Journal et critiques de saison, du plus récent au plus ancien (les deux listes arrivent déjà triées).
  const items: ({ kind: "line"; line: JournalLine } | { kind: "season"; review: SeasonReviewLine })[] = [];
  let i = 0;
  let j = 0;
  while (i < lines.length || j < seasonReviews.length) {
    if (j >= seasonReviews.length || (i < lines.length && lines[i].at >= seasonReviews[j].at)) items.push({ kind: "line", line: lines[i++] });
    else items.push({ kind: "season", review: seasonReviews[j++] });
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Mon journal ({total})</h2>
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
            knownTags={knownTags}
            busy={busy === "add"}
            onSubmit={async (v) => {
              if (await run("add", `/api/library/${entryId}/journal`, v)) setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10">
          {items.map((item) => {
            if (item.kind === "season") {
              const r = item.review;
              return (
                <li key={`saison-${r.id}`} className="px-4 py-3">
                  <SeasonReviewItem review={r} prefix={seasonTitle(r.season, seasonNames[r.season])} />
                </li>
              );
            }
            const line = item.line;
            const detail = what(line, titles, type);
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
                    knownTags={knownTags}
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
                          <li key={t}>
                            <Link
                              href={`/bibliotheque?tag=${encodeURIComponent(t)}`}
                              title={`Toutes les œuvres avec #${t}`}
                              className="block rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70 hover:bg-white/20 hover:text-white"
                            >
                              #{t}
                            </Link>
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
