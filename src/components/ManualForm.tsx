"use client";

import { useEffect, useState, type FormEvent } from "react";
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
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms);
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
      platforms,
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
      </div>
      {type === "game" && <PlatformPicker value={platforms} onChange={setPlatforms} />}
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

/**
 * Plateformes d'un jeu ajouté à la main, choisies parmi celles de ta bibliothèque (les mêmes noms que le filtre
 * « Plateforme », donc le jeu y apparaît). Une plateforme absente de la liste peut quand même être ajoutée.
 */
function PlatformPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [known, setKnown] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/manuel/plateformes")
      .then((res) => res.json() as Promise<{ platforms?: string[] }>)
      .then((json) => {
        if (!cancelled) setKnown(json.platforms ?? []);
      })
      .catch(() => {
        if (!cancelled) setKnown([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((v) => v !== p) : [...value, p]);
  const q = query.trim().toLowerCase();
  const list = (known ?? []).filter((p) => !value.includes(p) && (!q || p.toLowerCase().includes(q)));
  const exact = (known ?? []).some((p) => p.toLowerCase() === q) || value.some((p) => p.toLowerCase() === q);

  return (
    <div className="space-y-2 text-sm">
      <span className="text-white/70">Plateformes</span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Plateformes choisies">
          {value.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => toggle(p)} className="rounded-full bg-sky-500/20 px-3 py-1 text-sky-100 ring-1 ring-sky-400/40 hover:bg-sky-500/30">
                {p} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher une plateforme (PS1, Switch, PC…)"
        aria-label="Chercher une plateforme"
        className={field}
      />
      {known === null ? (
        <p className="text-xs text-white/50">Chargement des plateformes…</p>
      ) : (
        <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {list.slice(0, 60).map((p) => (
            <li key={p}>
              <button type="button" onClick={() => toggle(p)} className="rounded-full bg-white/5 px-3 py-1 text-white/80 ring-1 ring-white/10 hover:bg-white/10">
                + {p}
              </button>
            </li>
          ))}
          {q && !exact && (
            <li>
              <button
                type="button"
                onClick={() => {
                  toggle(query.trim());
                  setQuery("");
                }}
                className="rounded-full border border-dashed border-white/20 px-3 py-1 text-white/60 hover:text-white"
              >
                + Ajouter « {query.trim()} »
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
