"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { VIEW_COOKIE, type LibraryCard, type PosterSize, type SortKey, type ViewPrefs } from "@/lib/browse-shared";
import { sortDetail, STATUS_ORDER, statusLabel } from "@/lib/labels";
import { statusesFor, type LibraryStatus, type MediaType } from "@/lib/types";
import { DEVICES, EMULATORS, isComputer, LAUNCHERS, subscriptionsFor, SUBSCRIPTIONS, type Ownership } from "@/lib/ownership-shared";
import { MediaCard } from "./MediaCard";
import { MediaRow } from "./MediaRow";
import { useAction } from "./useAction";

const GRID: Record<PosterSize, string> = {
  petite: "grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12",
  moyenne: "grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  grande: "grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
};

const SIZE_LABELS: Record<PosterSize, string> = { petite: "Petites", moyenne: "Moyennes", grande: "Grandes" };

interface Props {
  cards: LibraryCard[];
  prefs: ViewPrefs;
  showType: boolean;
  sort: SortKey;
  /** Type affiché (libellés des statuts) ; null si la page mélange les types. */
  type: MediaType | null;
}

/**
 * Résultats de la bibliothèque : grille (3 tailles) ou liste, et sélection multiple
 * pour changer le statut ou les favoris de plusieurs œuvres d'un coup.
 */
export function LibraryResults({ cards, prefs, showType, sort, type }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { run, busy, error } = useAction();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [owning, setOwning] = useState(false);

  // L'affichage est mémorisé dans un cookie (un an), relu par la page côté serveur (taille de page).
  function setPrefs(next: Partial<ViewPrefs>) {
    const value = { ...prefs, ...next };
    document.cookie = `${VIEW_COOKIE}=${value.view}-${value.size}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // La sélection reste quand on change de page : on peut choisir des œuvres sur plusieurs pages.
  const allOnPage = cards.length > 0 && cards.every((c) => selected.has(c.entryId));
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  // Libellés des statuts : ceux du type affiché, sinon communs (« Watchlist / Backlog »).
  const labelType = type;

  async function apply(id: string, body: { status?: LibraryStatus; isFavorite?: boolean }) {
    if (await run(id, "/api/library/bulk", { entryIds: [...selected], ...body })) stop();
  }

  const button = "rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10";
  const toggleOn = "border-white bg-white text-black hover:bg-white/90";

  return (
    <div className={`space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-white/15 text-sm" role="group" aria-label="Affichage">
          <button
            type="button"
            onClick={() => setPrefs({ view: "grille" })}
            aria-pressed={prefs.view === "grille"}
            className={`px-3 py-1.5 ${prefs.view === "grille" ? "bg-white text-black" : "hover:bg-white/10"}`}
          >
            ▦ Grille
          </button>
          <button
            type="button"
            onClick={() => setPrefs({ view: "liste" })}
            aria-pressed={prefs.view === "liste"}
            className={`px-3 py-1.5 ${prefs.view === "liste" ? "bg-white text-black" : "hover:bg-white/10"}`}
          >
            ☰ Liste
          </button>
        </div>
        {prefs.view === "grille" && (
          <select
            value={prefs.size}
            onChange={(e) => setPrefs({ size: e.target.value as PosterSize })}
            aria-label="Taille des affiches"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
          >
            {(Object.keys(SIZE_LABELS) as PosterSize[]).map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]} affiches
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {selecting && (
            <button
              type="button"
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  for (const c of cards) {
                    if (allOnPage) next.delete(c.entryId);
                    else next.add(c.entryId);
                  }
                  return next;
                })
              }
              className={button}
            >
              {allOnPage ? "Désélectionner la page" : "Sélectionner la page"}
            </button>
          )}
          <button type="button" onClick={() => (selecting ? stop() : setSelecting(true))} className={`${button} ${selecting ? toggleOn : ""}`}>
            {selecting ? "Terminer la sélection" : "☑ Sélectionner"}
          </button>
        </div>
      </div>

      {prefs.view === "liste" ? (
        <ul className="divide-y divide-white/5">
          {cards.map((card) => (
            <li key={card.entryId} className="relative">
              <MediaRow card={card} showType={showType} detail={sortDetail(sort, card.type, card.sortValue)} actions={!selecting} />
              {selecting && <SelectOverlay checked={selected.has(card.entryId)} title={card.title} onToggle={() => toggle(card.entryId)} row />}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={`grid ${GRID[prefs.size]}`}>
          {cards.map((card) => (
            <li key={card.entryId} className="relative">
              <MediaCard
                card={card}
                showType={showType}
                compact={prefs.size === "petite"}
                actions={!selecting && prefs.size !== "petite"}
                detail={prefs.size === "petite" ? null : sortDetail(sort, card.type, card.sortValue)}
              />
              {selecting && <SelectOverlay checked={selected.has(card.entryId)} title={card.title} onToggle={() => toggle(card.entryId)} />}
            </li>
          ))}
        </ul>
      )}

      {selecting && (
        <div className="sticky bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-neutral-900/95 p-3 shadow-2xl ring-1 ring-white/20 backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <select
            value=""
            disabled={selected.size === 0 || busy !== null}
            onChange={(e) => e.target.value && apply("status", { status: e.target.value as LibraryStatus })}
            aria-label="Changer le statut de la sélection"
            className="rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">{busy === "status" ? "…" : "Changer le statut…"}</option>
            {STATUS_ORDER.filter((s) => statusesFor(labelType).includes(s)).map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, labelType)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selected.size === 0 || busy !== null}
            onClick={() => apply("fav", { isFavorite: true })}
            className={`${button} disabled:opacity-50`}
          >
            {busy === "fav" ? "…" : "♥ Favoris"}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || busy !== null}
            onClick={() => apply("unfav", { isFavorite: false })}
            className={`${button} disabled:opacity-50`}
          >
            {busy === "unfav" ? "…" : "♡ Retirer des favoris"}
          </button>
          {type === "game" && (
            <button type="button" disabled={selected.size === 0 || busy !== null} onClick={() => setOwning((o) => !o)} className={`${button} disabled:opacity-50`}>
              🎮 Possédé sur…
            </button>
          )}
          {type === "game" && owning && selected.size > 0 && (
            <BulkOwnership
              busy={busy !== null}
              onAdd={async (add) => {
                if (await run("own", "/api/library/possession", { entryIds: [...selected], add })) {
                  setOwning(false);
                  stop();
                }
              }}
              onRemove={async (platform) => {
                if (await run("own", "/api/library/possession", { entryIds: [...selected], removePlatform: platform })) {
                  setOwning(false);
                  stop();
                }
              }}
            />
          )}
          {error && <p className="w-full text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Saisie en masse : « possédé sur » pour tous les jeux sélectionnés (ou retirer une plateforme). */
function BulkOwnership({
  busy,
  onAdd,
  onRemove,
}: {
  busy: boolean;
  onAdd: (add: Ownership) => void;
  onRemove: (platform: string) => void;
}) {
  const [known, setKnown] = useState<string[]>([]);
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState<Ownership["format"]>("digital");
  const [store, setStore] = useState("steam");
  const [subscription, setSubscription] = useState("");
  const [device, setDevice] = useState("");
  const [emulator, setEmulator] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/manuel/plateformes")
      .then((res) => res.json() as Promise<{ platforms?: string[] }>)
      .then((json) => {
        if (!cancelled) setKnown(json.platforms ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const p = platform.trim();
  const computer = isComputer(p);
  const subs = format === "digital" ? subscriptionsFor(p, computer ? store : null) : [];
  const select = "rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-sm";
  const build = (): Ownership => ({
    platform: p,
    format,
    store: computer && format === "digital" ? store : null,
    subscription: subs.includes(subscription) ? subscription : null,
    device: format === "emulated" ? device.trim() || null : null,
    emulator: format === "emulated" ? emulator.trim() || null : null,
  });

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/10 pt-2">
      <input list="omnilog-masse-plateformes" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Plateforme (PS5, PC…)" aria-label="Plateforme" className={select} />
      <datalist id="omnilog-masse-plateformes">
        {known.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <select value={format} onChange={(e) => setFormat(e.target.value as Ownership["format"])} aria-label="Format" className={select}>
        <option value="digital">{computer ? "Launcher" : "Dématérialisé"}</option>
        <option value="physical">{computer ? "Boîte" : "Physique"}</option>
        <option value="emulated">Émulateur</option>
      </select>
      {computer && format === "digital" && (
        <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Launcher" className={select}>
          {Object.entries(LAUNCHERS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      )}
      {subs.length > 0 && (
        <select value={subscription} onChange={(e) => setSubscription(e.target.value)} aria-label="Abonnement" className={select}>
          <option value="">Acheté (ou offert)</option>
          {subs.map((sub) => (
            <option key={sub} value={sub}>
              Via {SUBSCRIPTIONS[sub]}
            </option>
          ))}
        </select>
      )}
      {format === "emulated" && (
        <>
          <input list="omnilog-masse-appareils" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Appareil" aria-label="Appareil" className={select} />
          <datalist id="omnilog-masse-appareils">
            {DEVICES.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <input list="omnilog-masse-emulateurs" value={emulator} onChange={(e) => setEmulator(e.target.value)} placeholder="Émulateur" aria-label="Émulateur" className={select} />
          <datalist id="omnilog-masse-emulateurs">
            {EMULATORS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </>
      )}
      <button type="button" disabled={!p || busy} onClick={() => onAdd(build())} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
        Ajouter
      </button>
      <button
        type="button"
        disabled={!p || busy}
        onClick={() => {
          if (confirm(`Retirer ${p} (tous formats) des jeux sélectionnés ?`)) onRemove(p);
        }}
        className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:text-rose-300 disabled:opacity-50"
      >
        Retirer {p || "la plateforme"}
      </button>
    </div>
  );
}

/** Calque cliquable posé sur une vignette ou une ligne en mode sélection. */
function SelectOverlay({ checked, title, onToggle, row = false }: { checked: boolean; title: string; onToggle: () => void; row?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Sélectionner ${title}`}
      onClick={onToggle}
      className={`absolute inset-0 z-20 flex rounded-lg transition ${
        checked ? "bg-sky-400/20 ring-2 ring-sky-400" : "hover:bg-white/5"
      } ${row ? "items-center justify-end pr-3" : "items-start justify-end p-1.5"}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
          checked ? "border-sky-400 bg-sky-400 text-black" : "border-white/60 bg-black/60"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}
