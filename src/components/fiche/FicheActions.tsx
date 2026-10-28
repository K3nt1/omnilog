"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/types";
import type { MediaType } from "@/lib/types";
import { useAction } from "../useAction";

const button = "rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white disabled:opacity-50";
const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40";

interface Props {
  type: MediaType;
  /** Segment d'adresse du type (« films ») et identifiant chez la source. */
  slug: string;
  externalId: string;
  title: string;
  entry: {
    id: number;
    customPosterUrl: string | null;
    customBackdropUrl: string | null;
    backdropPosition: string | null;
  } | null;
  journalCount: number;
  sourcePoster: string | null;
  sourceBackdrop: string | null;
}

/** Actions secondaires de la fiche : rafraîchir, images perso, « Ce n'est pas la bonne œuvre », retirer. */
export function FicheActions({ type, slug, externalId, title, entry, journalCount, sourcePoster, sourceBackdrop }: Props) {
  const router = useRouter();
  const { run, busy, error } = useAction();
  const [dialog, setDialog] = useState<"images" | "rematch" | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("refresh", `/api/fiche/${slug}/${externalId}/refresh`, {})}
          className={button}
          title="Relire titres, affiche, épisodes, saisons et diffusion chez la source"
        >
          {busy === "refresh" ? "Rafraîchissement…" : "↻ Rafraîchir les infos"}
        </button>
        {entry && (
          <>
            <button type="button" onClick={() => setDialog("images")} className={button}>
              🖼 Affiche et fond
            </button>
            <button type="button" onClick={() => setDialog("rematch")} className={button}>
              Ce n&apos;est pas la bonne œuvre
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const lines = journalCount > 0 ? ` et ton journal (${journalCount} ligne${journalCount > 1 ? "s" : ""})` : "";
                if (!confirm(`Retirer « ${title} » de ta bibliothèque ? Ton suivi${lines} seront supprimés.`)) return;
                await run("remove", `/api/library/${entry.id}`, null, "DELETE");
              }}
              className={`${button} hover:text-rose-300`}
            >
              {busy === "remove" ? "…" : "Retirer de la bibliothèque"}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {dialog === "images" && entry && (
        <ImagesDialog
          slug={slug}
          externalId={externalId}
          entry={entry}
          sourcePoster={sourcePoster}
          sourceBackdrop={sourceBackdrop}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "rematch" && entry && (
        <RematchDialog
          type={type}
          entryId={entry.id}
          title={title}
          currentId={externalId}
          onClose={() => setDialog(null)}
          onMoved={(href) => {
            setDialog(null);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl space-y-4 rounded-xl bg-neutral-900 p-4 shadow-2xl ring-1 ring-white/15 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="px-2 text-white/60 hover:text-white">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Position CSS « 50% 30% » → [50, 30]. */
function parsePosition(value: string | null): [number, number] {
  const m = value?.match(/^(\d{1,3})% (\d{1,3})%$/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

/** Choisir l'affiche et l'image de fond (proposées par la source ou par adresse), et cadrer le fond. */
function ImagesDialog({
  slug,
  externalId,
  entry,
  sourcePoster,
  sourceBackdrop,
  onClose,
}: {
  slug: string;
  externalId: string;
  entry: NonNullable<Props["entry"]>;
  sourcePoster: string | null;
  sourceBackdrop: string | null;
  onClose: () => void;
}) {
  const { run, busy, error } = useAction();
  const [tab, setTab] = useState<"poster" | "backdrop">("poster");
  const [images, setImages] = useState<{ posters: string[]; backdrops: string[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(entry.customPosterUrl);
  const [backdrop, setBackdrop] = useState<string | null>(entry.customBackdropUrl);
  const [[x, y], setPosition] = useState(parsePosition(entry.backdropPosition));
  const [url, setUrl] = useState("");
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/fiche/${slug}/${externalId}/images`)
      .then(async (res) => {
        const json = (await res.json()) as { posters: string[]; backdrops: string[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Images indisponibles.");
        if (alive) setImages(json);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "Images indisponibles."));
    return () => {
      alive = false;
    };
  }, [slug, externalId]);

  const shownBackdrop = backdrop ?? sourceBackdrop;
  const list = tab === "poster" ? (images?.posters ?? []) : (images?.backdrops ?? []);
  const chosen = tab === "poster" ? poster : backdrop;
  const choose = (value: string | null) => (tab === "poster" ? setPoster(value) : setBackdrop(value));
  const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

  return (
    <Modal title="Affiche et image de fond" onClose={onClose}>
      <div className="flex gap-2 text-sm" role="tablist">
        {(["poster", "backdrop"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 ${tab === t ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
          >
            {t === "poster" ? "Affiche" : "Image de fond"}
          </button>
        ))}
      </div>

      {tab === "backdrop" && shownBackdrop && (
        <div className="space-y-2">
          <p className="text-xs text-white/60">Cadrage : fais glisser l&apos;image ou utilise les curseurs.</p>
          <div
            className="relative h-40 cursor-grab touch-none overflow-hidden rounded-lg ring-1 ring-white/15 active:cursor-grabbing sm:h-52"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { startX: e.clientX, startY: e.clientY, x, y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const box = e.currentTarget.getBoundingClientRect();
              // Glisser l'image vers le bas montre le haut : la position diminue.
              setPosition([clamp(d.x - ((e.clientX - d.startX) / box.width) * 100), clamp(d.y - ((e.clientY - d.startY) / box.height) * 100)]);
            }}
            onPointerUp={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownBackdrop} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-white/70">
            <label className="flex items-center gap-2">
              Horizontal
              <input type="range" min={0} max={100} value={x} onChange={(e) => setPosition([Number(e.target.value), y])} />
            </label>
            <label className="flex items-center gap-2">
              Vertical
              <input type="range" min={0} max={100} value={y} onChange={(e) => setPosition([x, Number(e.target.value)])} />
            </label>
            <button type="button" onClick={() => setPosition([50, 50])} className="underline hover:text-white">
              Centrer
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs text-white/60">{tab === "poster" ? "Affiches proposées par la source" : "Images proposées par la source"}</p>
        {loadError && <p className="text-sm text-rose-400">{loadError}</p>}
        {!images && !loadError && <p className="text-sm text-white/50">Chargement…</p>}
        <ul className={`grid max-h-80 gap-2 overflow-y-auto pr-1 ${tab === "poster" ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3"}`}>
          <li>
            <button
              type="button"
              onClick={() => choose(null)}
              className={`flex w-full items-center justify-center overflow-hidden rounded-md bg-white/5 text-center text-xs text-white/60 ring-2 ${
                tab === "poster" ? "aspect-[2/3]" : "aspect-video"
              } ${chosen === null ? "ring-sky-400" : "ring-transparent hover:ring-white/30"}`}
            >
              {(tab === "poster" ? sourcePoster : sourceBackdrop) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(tab === "poster" ? sourcePoster : sourceBackdrop)!} alt="Image d'origine" className="h-full w-full object-cover opacity-70" />
              ) : (
                "Image d'origine"
              )}
            </button>
          </li>
          {list.map((src) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => choose(src)}
                className={`block w-full overflow-hidden rounded-md ring-2 ${tab === "poster" ? "aspect-[2/3]" : "aspect-video"} ${
                  chosen === src ? "ring-sky-400" : "ring-transparent hover:ring-white/30"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
        {images && list.length === 0 && <p className="mt-2 text-sm text-white/50">La source ne propose pas d&apos;autre image : colle une adresse ci-dessous.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Ou colle l'adresse d'une image (https://…)"
          className={`${field} min-w-60 flex-1`}
        />
        <button
          type="button"
          disabled={!/^https:\/\/\S+$/.test(url.trim())}
          onClick={() => {
            choose(url.trim());
            setUrl("");
          }}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
        >
          Utiliser
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
        {error && <p className="mr-auto text-sm text-rose-400">{error}</p>}
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:text-white">
          Annuler
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            const ok = await run(
              "save",
              `/api/library/${entry.id}`,
              { customPosterUrl: poster, customBackdropUrl: backdrop, backdropPosition: x === 50 && y === 50 ? null : `${x}% ${y}%` },
              "PATCH",
            );
            if (ok) onClose();
          }}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          {busy === "save" ? "…" : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

/** « Ce n'est pas la bonne œuvre » : chercher la bonne œuvre (même type) et y transférer le suivi. */
function RematchDialog({
  type,
  entryId,
  title,
  currentId,
  onClose,
  onMoved,
}: {
  type: MediaType;
  entryId: number;
  title: string;
  currentId: string;
  onClose: () => void;
  onMoved: (href: string) => void;
}) {
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&types=${type}`);
      const json = (await res.json()) as { results?: SearchResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Recherche impossible.");
      setResults((json.results ?? []).filter((r) => r.type === type));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      setSearching(false);
    }
  }

  async function move(externalId: string) {
    setMoving(externalId);
    setMessage(null);
    try {
      const res = await fetch(`/api/library/${entryId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId }),
      });
      const json = (await res.json()) as { href?: string; error?: string };
      if (!res.ok || !json.href) throw new Error(json.error ?? "Changement impossible.");
      onMoved(json.href);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Changement impossible.");
      setMoving(null);
    }
  }

  return (
    <Modal title="Ce n'est pas la bonne œuvre" onClose={onClose}>
      <p className="text-sm text-white/70">
        Choisis la bonne œuvre : ton statut, ta note, ta progression et ton journal passent dessus, et un prochain import ira directement à
        elle.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${field} flex-1`} aria-label="Chercher la bonne œuvre" autoFocus />
        <button type="submit" disabled={searching} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
          {searching ? "…" : "Chercher"}
        </button>
      </form>
      {message && <p className="text-sm text-rose-400">{message}</p>}
      {results && results.length === 0 && <p className="text-sm text-white/50">Aucun résultat.</p>}
      {results && results.length > 0 && (
        <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
          {results.map((r) => (
            <li key={r.key} className="flex items-center gap-3 py-2">
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-white/5">
                {r.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-1 font-medium">
                  {r.title} {r.year && <span className="font-normal text-white/50">{r.year}</span>}
                </p>
                {r.originalTitle && <p className="line-clamp-1 text-xs text-white/50">{r.originalTitle}</p>}
                {r.libraryStatus && r.externalId !== currentId && <p className="text-xs text-amber-300">Déjà dans ta bibliothèque</p>}
              </div>
              {r.externalId === currentId ? (
                <span className="text-xs text-white/50">Œuvre actuelle</span>
              ) : (
                <button
                  type="button"
                  disabled={moving !== null}
                  onClick={() => move(r.externalId)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                >
                  {moving === r.externalId ? "…" : "C'est celle-ci"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
