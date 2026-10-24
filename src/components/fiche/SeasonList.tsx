"use client";

import { useState } from "react";
import type { SeasonEpisodeResponse } from "@/lib/fiche/types";
import { dateLabel, durationLabel, starsLabel } from "@/lib/labels";
import type { SeasonInfo } from "@/lib/types";
import { RichText } from "../RichText";

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "done"; episodes: SeasonEpisodeResponse[] };

const pad = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function Episode({ season, e }: { season: number; e: SeasonEpisodeResponse }) {
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
      <div className="shrink-0 text-right text-xs sm:w-32">
        {e.watched ? (
          <>
            <p className="text-emerald-300">✓ Vu le {dateLabel(e.watched.at)}</p>
            {e.watched.count > 1 && <p className="text-white/50">{e.watched.count} visionnages</p>}
            {e.watched.rating !== null && <p className="text-amber-300">★ {starsLabel(e.watched.rating)}</p>}
          </>
        ) : (
          <p className="text-white/40">Pas vu</p>
        )}
      </div>
    </li>
  );
}

/** Saisons d'une série : chacune se déroule pour afficher ses épisodes (chargés à la demande). */
export function SeasonList({ tmdbId, seasons }: { tmdbId: string; seasons: SeasonInfo[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState<Record<number, Loaded>>({});

  async function toggle(season: number) {
    const next = new Set(open);
    if (next.has(season)) {
      next.delete(season);
      setOpen(next);
      return;
    }
    next.add(season);
    setOpen(next);
    if (loaded[season]?.status === "done" || loaded[season]?.status === "loading") return;
    setLoaded((l) => ({ ...l, [season]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/fiche/tv/${tmdbId}/saison/${season}`);
      const json = (await res.json()) as { episodes?: SeasonEpisodeResponse[]; error?: string };
      if (!res.ok || !json.episodes) throw new Error(json.error ?? "Saison indisponible.");
      setLoaded((l) => ({ ...l, [season]: { status: "done", episodes: json.episodes! } }));
    } catch (e) {
      setLoaded((l) => ({ ...l, [season]: { status: "error", message: e instanceof Error ? e.message : "Saison indisponible." } }));
    }
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
                        <Episode key={e.number} season={s.seasonNumber} e={e} />
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
