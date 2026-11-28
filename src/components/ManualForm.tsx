"use client";

import { useState, type FormEvent } from "react";
import { statusLabel, TYPE_SINGULAR } from "@/lib/labels";
import { MEDIA_TYPES, statusesFor, type LibraryStatus, type MediaType } from "@/lib/types";

const field = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40";
const label = "block space-y-1 text-sm";

/** Valeurs du formulaire (ce que modifie la fiche d'une œuvre ajoutée à la main). */
export interface ManualValues {
  title: string;
  release: string;
  posterUrl: string;
  overview: string;
  runtimeMinutes: number | null;
  totalEpisodes: number | null;
  seasons: number[];
  totalChapters: number | null;
  totalVolumes: number | null;
  platforms: string[];
}

export const EMPTY_MANUAL: ManualValues = {
  title: "",
  release: "",
  posterUrl: "",
  overview: "",
  runtimeMinutes: null,
  totalEpisodes: null,
  seasons: [],
  totalChapters: null,
  totalVolumes: null,
  platforms: [],
};

const toNumber = (value: string): number | null => (value.trim() === "" ? null : Number(value));

/**
 * Formulaire d'une œuvre ajoutée à la main : titre (obligatoire), date ou année de sortie, image, résumé,
 * et selon le type la durée, les épisodes, les saisons, les chapitres / tomes, les numéros ou les plateformes.
 * `withStatus` : à la création, on choisit aussi dans quelle liste l'ajouter.
 */
export function ManualForm({
  initialType,
  lockType = false,
  initial = EMPTY_MANUAL,
  withStatus = false,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initialType: MediaType;
  lockType?: boolean;
  initial?: ManualValues;
  withStatus?: boolean;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<MediaType>(initialType);
  const [title, setTitle] = useState(initial.title);
  const [release, setRelease] = useState(initial.release);
  const [posterUrl, setPosterUrl] = useState(initial.posterUrl);
  const [overview, setOverview] = useState(initial.overview);
  const [runtime, setRuntime] = useState(initial.runtimeMinutes?.toString() ?? "");
  const [episodes, setEpisodes] = useState(initial.totalEpisodes?.toString() ?? "");
  const [seasons, setSeasons] = useState(initial.seasons.join(", "));
  const [chapters, setChapters] = useState(initial.totalChapters?.toString() ?? "");
  const [volumes, setVolumes] = useState(initial.totalVolumes?.toString() ?? "");
  const [platforms, setPlatforms] = useState(initial.platforms.join(", "));
  const [status, setStatus] = useState<LibraryStatus>("planned");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      type,
      title,
      release,
      posterUrl,
      overview,
      runtimeMinutes: toNumber(runtime),
      totalEpisodes: toNumber(episodes),
      // « 10, 8, 12 » → une saison de 10 épisodes, une de 8, une de 12.
      seasons: seasons
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number),
      totalChapters: toNumber(chapters),
      totalVolumes: toNumber(volumes),
      platforms: platforms
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      ...(withStatus ? { status } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!lockType && (
        <label className={label}>
          <span className="text-white/70">Type</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as MediaType);
              setStatus("planned");
            }}
            className={field}
          >
            {MEDIA_TYPES.map((t) => (
              <option key={t} value={t} className="bg-neutral-900">
                {TYPE_SINGULAR[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        <span className="text-white/70">Titre *</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className="text-white/70">Sortie</span>
          <input
            value={release}
            onChange={(e) => setRelease(e.target.value)}
            placeholder="1996 ou 1996-09-26"
            pattern="\d{4}(-\d{2}-\d{2})?"
            className={field}
          />
        </label>
        {type === "movie" && (
          <label className={label}>
            <span className="text-white/70">Durée (minutes)</span>
            <input type="number" min={0} value={runtime} onChange={(e) => setRuntime(e.target.value)} className={field} />
          </label>
        )}
        {type === "anime" && (
          <label className={label}>
            <span className="text-white/70">Nombre d&apos;épisodes</span>
            <input type="number" min={0} value={episodes} onChange={(e) => setEpisodes(e.target.value)} className={field} />
          </label>
        )}
        {type === "tv" && (
          <label className={label}>
            <span className="text-white/70">Épisodes par saison</span>
            <input value={seasons} onChange={(e) => setSeasons(e.target.value)} placeholder="10, 8, 12" className={field} />
          </label>
        )}
        {(type === "manga" || type === "comic") && (
          <label className={label}>
            <span className="text-white/70">{type === "manga" ? "Nombre de chapitres" : "Nombre de numéros"}</span>
            <input type="number" min={0} value={chapters} onChange={(e) => setChapters(e.target.value)} className={field} />
          </label>
        )}
        {type === "manga" && (
          <label className={label}>
            <span className="text-white/70">Nombre de tomes</span>
            <input type="number" min={0} value={volumes} onChange={(e) => setVolumes(e.target.value)} className={field} />
          </label>
        )}
        {type === "game" && (
          <label className={label}>
            <span className="text-white/70">Plateformes</span>
            <input value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="PC, PlayStation" className={field} />
          </label>
        )}
      </div>
      <label className={label}>
        <span className="text-white/70">Image (adresse https://…)</span>
        <input type="url" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="https://…" className={field} />
      </label>
      <label className={label}>
        <span className="text-white/70">Résumé</span>
        <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} maxLength={4000} className={field} />
      </label>
      {withStatus && (
        <label className={label}>
          <span className="text-white/70">Ajouter à</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as LibraryStatus)} className={field}>
            {statusesFor(type).map((s) => (
              <option key={s} value={s} className="bg-neutral-900">
                {statusLabel(s, type)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
          {busy ? "…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
