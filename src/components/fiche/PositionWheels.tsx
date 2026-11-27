"use client";

import { useEffect, useState } from "react";
import type { LibraryEntry } from "@/lib/entry";
import type { VolumeRange } from "@/lib/manga";
import { lastVolumeRead, nextPosition, range, type Position } from "@/lib/position";
import type { MediaType, SeasonInfo } from "@/lib/types";
import { Wheel } from "./Wheel";

const secondary = "rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50";

/**
 * « Où j'en suis », à la molette comme sur MyAnimeList : on choisit le DERNIER épisode vu / chapitre / tome lu,
 * et Omnilog en déduit la suite (Omnilog garde le prochain à voir / lire). Rien n'est écrit au journal.
 * Manga : choisir un tome place le chapitre sur le dernier chapitre de ce tome (d'après MangaDex),
 * et choisir un chapitre place le tome sur le dernier tome entièrement lu.
 */
export function PositionWheels({
  entry,
  type,
  seasons,
  totalEpisodes,
  totalChapters,
  totalVolumes,
  busy,
  onSave,
}: {
  entry: LibraryEntry;
  type: MediaType;
  /** Saisons normales (sans les épisodes spéciaux). */
  seasons: SeasonInfo[];
  totalEpisodes: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  busy: boolean;
  onSave: (position: Position) => void;
}) {
  // Position actuelle (prochain à voir / lire) → dernier vu / lu.
  const [season, setSeason] = useState(entry.currentSeason ?? seasons[0]?.seasonNumber ?? 1);
  const [episode, setEpisode] = useState(Math.max(0, (entry.currentEpisode ?? 1) - 1));
  const [chapter, setChapter] = useState(Math.max(0, Math.ceil(entry.currentChapter ?? 1) - 1));
  const [volume, setVolume] = useState(Math.max(0, (entry.currentVolume ?? 1) - 1));
  const [volumes, setVolumes] = useState<VolumeRange[] | null>(null);

  // Manga : tomes et chapitres d'après MangaDex (une requête, gardée un jour côté serveur).
  useEffect(() => {
    if (type !== "manga") return;
    let cancelled = false;
    fetch(`/api/library/${entry.id}/tomes`)
      .then((res) => res.json() as Promise<{ volumes?: VolumeRange[] }>)
      .then((json) => {
        if (!cancelled) setVolumes(json.volumes ?? []);
      })
      .catch(() => {
        if (!cancelled) setVolumes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [type, entry.id]);

  const seasonInfo = seasons.find((s) => s.seasonNumber === season);
  const knownLastVolume = volumes?.at(-1)?.volume ?? 0;
  const knownLastChapter = volumes?.at(-1)?.last ?? 0;
  const volumeMax = Math.max(totalVolumes ?? 0, knownLastVolume, volume + 3, 1);
  const chapterMax = Math.max(totalChapters ?? 0, Math.floor(knownLastChapter), chapter + 50);

  function pickVolume(v: number) {
    setVolume(v);
    if (v === 0) return setChapter(0);
    const known = volumes?.find((r) => r.volume === v);
    if (known) setChapter(Math.floor(known.last));
  }

  function pickChapter(c: number) {
    setChapter(c);
    if (!volumes || volumes.length === 0) return;
    setVolume(lastVolumeRead(volumes, c));
  }

  const next = () => nextPosition({ type, seasons, season, episode, chapter, volume, totalVolumes });

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-black/20 p-3">
      {type === "tv" && (
        <>
          <Wheel
            label="Saison"
            values={seasons.length > 0 ? seasons.map((s) => s.seasonNumber) : [season]}
            value={season}
            onChange={(v) => {
              setSeason(v);
              setEpisode(0);
            }}
            hint={seasons.length > 0 ? plural(seasons.length, "saison") : undefined}
          />
          <Wheel
            label="Dernier épisode vu"
            values={range(0, seasonInfo?.episodeCount ?? Math.max(episode, 1) + 20)}
            value={episode}
            onChange={setEpisode}
            hint={seasonInfo ? plural(seasonInfo.episodeCount, "épisode") : undefined}
            format={(v) => (v === 0 ? "–" : String(v))}
          />
        </>
      )}
      {type === "anime" && (
        <Wheel
          label="Dernier épisode vu"
          values={range(0, totalEpisodes ?? Math.max(episode + 50, 100))}
          value={episode}
          onChange={setEpisode}
          hint={totalEpisodes ? plural(totalEpisodes, "épisode") : undefined}
          format={(v) => (v === 0 ? "–" : String(v))}
        />
      )}
      {type === "manga" && (
        <>
          <Wheel
            label="Dernier tome lu"
            values={range(0, volumeMax)}
            value={volume}
            onChange={pickVolume}
            hint={totalVolumes ? plural(totalVolumes, "tome") : undefined}
            format={(v) => (v === 0 ? "–" : String(v))}
          />
          <Wheel
            label="Dernier chapitre lu"
            values={range(0, chapterMax)}
            value={chapter}
            onChange={pickChapter}
            hint={totalChapters ? plural(totalChapters, "chapitre") : undefined}
            format={(v) => (v === 0 ? "–" : String(v))}
          />
          {volumes !== null && volumes.length === 0 && (
            <p className="text-xs text-white/50">MangaDex ne relie pas encore les chapitres de ce manga à ses tomes : le chapitre ne suit pas le tome.</p>
          )}
        </>
      )}
      {type === "comic" && (
        <Wheel
          label="Dernier numéro lu"
          values={range(0, Math.max(totalChapters ?? 0, chapter + 50))}
          value={chapter}
          onChange={setChapter}
          hint={totalChapters ? plural(totalChapters, "numéro") : undefined}
          format={(v) => (v === 0 ? "–" : String(v))}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => onSave(next())} className={secondary}>
          Enregistrer
        </button>
        <span className="text-xs text-white/50">Rien n&apos;est ajouté au journal : c&apos;est juste l&apos;endroit où tu en es.</span>
      </div>
    </div>
  );
}
