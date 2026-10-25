"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SeasonEpisodeResponse } from "@/lib/fiche/types";
import { dateLabel, durationLabel } from "@/lib/labels";
import type { SeasonInfo } from "@/lib/types";
import { htmlToPlain, RichText } from "../RichText";
import { PROGRESS_EVENT, useAction } from "../useAction";
import { StarRating } from "./StarRating";

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "done"; episodes: SeasonEpisodeResponse[] };

const pad = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Actions sur un épisode : cocher (avec note / critique), noter, écrire la critique, retirer. */
function EpisodeActions({
  entryId,
  season,
  e,
  onChange,
}: {
  entryId: number;
  season: number;
  e: SeasonEpisodeResponse;
  onChange: () => void;
}) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(e.watched?.rating ?? null);
  const [review, setReview] = useState(e.watched?.review ? htmlToPlain(e.watched.review) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const done = async (ok: boolean) => {
    if (ok) {
      setOpen(false);
      onChange();
    }
  };
  const mark = (withDetails: boolean) =>
    run("mark", `/api/library/${entryId}/progress`, {
      kind: "markEpisode",
      season,
      episode: e.number,
      date,
      ...(withDetails ? { rating, review: review.trim() || null } : {}),
    }).then(done);
  const save = (patch: Record<string, unknown>) => run("save", `/api/journal/${e.watched!.logId}`, patch, "PATCH").then(done);
  const button = "rounded-md px-2 py-1 text-xs disabled:opacity-50";

  return (
    <div className="space-y-1.5 text-right text-xs">
      {e.watched ? (
        <>
          <p className="text-emerald-300">✓ Vu le {dateLabel(e.watched.at)}</p>
          {e.watched.count > 1 && <p className="text-white/50">{e.watched.count} visionnages</p>}
          <div className="flex justify-end">
            <StarRating small value={e.watched.rating} onChange={(r) => save({ rating: r })} disabled={busy !== null} />
          </div>
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => setOpen((v) => !v)} className={`${button} bg-white/10 hover:bg-white/20`}>
              {e.watched.review ? "Modifier la critique" : "Critique"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("unmark", `/api/journal/${e.watched!.logId}`, null, "DELETE").then(done)}
              className={`${button} text-white/50 hover:text-rose-300`}
            >
              Retirer
            </button>
          </div>
        </>
      ) : (
        <div className="flex justify-end gap-1">
          <button type="button" disabled={busy !== null} onClick={() => mark(false)} className={`${button} bg-white font-medium text-black hover:bg-white/90`}>
            {busy === "mark" ? "…" : "✓ Vu"}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} className={`${button} bg-white/10 hover:bg-white/20`}>
            + note, critique
          </button>
        </div>
      )}
      {open && (
        <div className="space-y-2 rounded-md bg-black/30 p-2 text-left">
          {!e.watched && (
            <div className="flex flex-wrap items-center gap-2">
              <StarRating small value={rating} onChange={setRating} />
              <input
                type="date"
                value={date}
                onChange={(ev) => setDate(ev.target.value || date)}
                className="rounded border border-white/15 bg-white/5 px-2 py-0.5"
                aria-label="Date du visionnage"
              />
            </div>
          )}
          <textarea
            value={review}
            onChange={(ev) => setReview(ev.target.value)}
            rows={3}
            placeholder="Ta critique de l'épisode…"
            className="block w-full rounded border border-white/15 bg-white/5 px-2 py-1 text-sm outline-none focus:border-white/40"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => (e.watched ? save({ review: review.trim() || null }) : mark(true))}
            className={`${button} bg-white font-medium text-black hover:bg-white/90`}
          >
            {e.watched ? "Enregistrer" : "✓ Vu, avec note et critique"}
          </button>
        </div>
      )}
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}

function Episode({ season, e, entryId, onChange }: { season: number; e: SeasonEpisodeResponse; entryId: number | null; onChange: () => void }) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row">
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md bg-white/5 sm:w-44">
        {e.stillUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.stillUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-xs text-white/50">
          {[`S${pad(season)}E${pad(e.number)}`, e.runtimeMinutes ? durationLabel(e.runtimeMinutes) : null, e.airDate ? dateLabel(e.airDate) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="font-medium">{e.name}</p>
        {e.overview && <p className="mt-1 line-clamp-3 text-white/70">{e.overview}</p>}
        {e.watched?.review && <RichText text={e.watched.review} className="mt-2 border-l-2 border-sky-400/40 pl-3 text-white/80" />}
      </div>
      <div className="shrink-0 sm:w-44">
        {entryId !== null ? (
          <EpisodeActions entryId={entryId} season={season} e={e} onChange={onChange} />
        ) : e.watched ? (
          <p className="text-right text-xs text-emerald-300">✓ Vu le {dateLabel(e.watched.at)}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Saisons d'une série : chacune se déroule pour afficher ses épisodes (chargés à la demande). */
export function SeasonList({ tmdbId, seasons, entryId }: { tmdbId: string; seasons: SeasonInfo[]; entryId: number | null }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState<Record<number, Loaded>>({});

  // Saisons ouvertes, à recharger quand une action est faite ailleurs sur la page (épisode vu dans le bandeau…).
  const openRef = useRef<Set<number>>(new Set());

  /** (Re)charge les épisodes d'une saison et tes visionnages. */
  const load = useCallback(
    async (season: number) => {
      try {
        const res = await fetch(`/api/fiche/tv/${tmdbId}/saison/${season}`);
        const json = (await res.json()) as { episodes?: SeasonEpisodeResponse[]; error?: string };
        if (!res.ok || !json.episodes) throw new Error(json.error ?? "Saison indisponible.");
        setLoaded((l) => ({ ...l, [season]: { status: "done", episodes: json.episodes! } }));
      } catch (e) {
        setLoaded((l) => ({ ...l, [season]: { status: "error", message: e instanceof Error ? e.message : "Saison indisponible." } }));
      }
    },
    [tmdbId],
  );

  useEffect(() => {
    const reload = () => openRef.current.forEach((season) => void load(season));
    window.addEventListener(PROGRESS_EVENT, reload);
    return () => window.removeEventListener(PROGRESS_EVENT, reload);
  }, [load]);

  async function toggle(season: number) {
    const next = new Set(open);
    if (next.has(season)) {
      next.delete(season);
      setOpen(next);
      openRef.current = next;
      return;
    }
    next.add(season);
    setOpen(next);
    openRef.current = next;
    if (loaded[season]?.status === "done" || loaded[season]?.status === "loading") return;
    setLoaded((l) => ({ ...l, [season]: { status: "loading" } }));
    await load(season);
  }

  // Saisons dans l'ordre, épisodes spéciaux (saison 0) à la fin.
  const sorted = [...seasons].sort((a, b) => (a.seasonNumber || 1e6) - (b.seasonNumber || 1e6));

  return (
    <ul className="space-y-2">
      {sorted.map((s) => {
        const state = loaded[s.seasonNumber];
        const isOpen = open.has(s.seasonNumber);
        const watched = state?.status === "done" ? state.episodes.filter((e) => e.watched).length : null;
        return (
          <li key={s.seasonNumber} className="rounded-lg bg-white/5 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => toggle(s.seasonNumber)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/5"
            >
              <span className="font-medium">
                <span className={`mr-2 inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                {s.name ?? (s.seasonNumber === 0 ? "Épisodes spéciaux" : `Saison ${s.seasonNumber}`)}
              </span>
              <span className="text-white/60">
                {[
                  watched !== null && watched > 0 ? `${watched} vu${watched > 1 ? "s" : ""} sur ${s.episodeCount}` : plural(s.episodeCount, "épisode"),
                  s.airDate ? s.airDate.slice(0, 4) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-white/10 px-4">
                {state?.status === "loading" && <p className="py-3 text-sm text-white/60">Chargement des épisodes…</p>}
                {state?.status === "error" && <p className="py-3 text-sm text-rose-400">{state.message}</p>}
                {state?.status === "done" &&
                  (state.episodes.length === 0 ? (
                    <p className="py-3 text-sm text-white/60">Aucun épisode connu.</p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {state.episodes.map((e) => (
                        <Episode key={`${e.number}-${e.watched?.logId ?? "non-vu"}`} season={s.seasonNumber} e={e} entryId={entryId} onChange={() => undefined} />
                      ))}
                    </ul>
                  ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
