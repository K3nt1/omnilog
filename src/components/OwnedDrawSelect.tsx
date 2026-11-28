"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { OwnedFacet } from "@/lib/ownership";

const KEY = "omnilog:tirage-possede";

const EVENT = "omnilog:tirage-possede";
/** Repli quand le stockage du navigateur est indisponible (navigation privée…) : le choix vaut pour la visite. */
let memory: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Plateforme choisie pour le tirage des jeux, gardée dans le navigateur (aussi pour « Relancer »). */
export function useDrawOwned(type: string): [string | null, (value: string | null) => void] {
  const saved = useSyncExternalStore<string | null>(subscribe, read, () => null);
  const choose = (value: string | null) => {
    memory = value;
    try {
      if (value) window.localStorage.setItem(KEY, value);
      else window.localStorage.removeItem(KEY);
    } catch {
      // Sans stockage, le choix n'est pas gardé.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [type === "game" ? saved : null, choose];
}

/** « Dans : tout le backlog / PS5 / PC · Steam / Game Pass… » (plateformes possédées, chargées à la demande). */
export function OwnedDrawSelect({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const [options, setOptions] = useState<OwnedFacet[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/library/possession")
      .then((res) => res.json() as Promise<{ owned?: OwnedFacet[] }>)
      .then((json) => {
        if (!cancelled) setOptions(json.owned ?? []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!options || (options.length === 0 && !value)) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Tirer au sort parmi les jeux possédés sur"
      className="rounded-lg border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-white/40"
    >
      <option value="">Tout le backlog</option>
      {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} ({o.count})
        </option>
      ))}
    </select>
  );
}
