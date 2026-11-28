"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PROGRESS_EVENT } from "./useAction";

interface Poster {
  title: string;
  posterUrl: string | null;
}

interface DrawResponse {
  entryId?: number;
  picked?: Poster | null;
  others?: Poster[];
  error?: string;
}

type Reveal = { reel: Poster[]; index: number; done: boolean };

/** Délais entre deux affiches : rapides au début, puis de plus en plus lents (≈ 2,2 s en tout). */
function delays(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(55 + 380 * (i / Math.max(1, count - 1)) ** 2.2));
}

/**
 * Tirage au sort avec animation : les affiches de la liste défilent puis ralentissent sur l'œuvre tirée.
 * Sans animation si l'appareil demande moins de mouvements. Renvoie le bouton à brancher et l'écran du tirage.
 */
export function useDraw(type: string, owned: string | null = null) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function finish() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setReveal(null);
    window.dispatchEvent(new Event(PROGRESS_EVENT));
    router.refresh();
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, owned }) });
      const json = (await res.json().catch(() => ({}))) as DrawResponse;
      if (!res.ok) throw new Error(json.error ?? "Tirage impossible.");
      const picked = json.picked ?? { title: "", posterUrl: null };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Le défilement passe deux fois par les autres affiches avant de s'arrêter sur l'œuvre tirée.
      const others = json.others ?? [];
      const reel = reduced || others.length === 0 ? [picked] : [...others, ...others.slice(0, 6), picked];
      for (const p of reel) if (p.posterUrl) new Image().src = p.posterUrl; // préchargement
      setReveal({ reel, index: 0, done: reel.length === 1 });
      let at = 0;
      delays(reel.length - 1).forEach((delay, i) => {
        at += delay;
        timers.current.push(window.setTimeout(() => setReveal((r) => (r ? { ...r, index: i + 1, done: i + 1 === r.reel.length - 1 } : r)), at));
      });
      timers.current.push(window.setTimeout(finish, at + 1600));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tirage impossible.");
    } finally {
      setBusy(false);
    }
  }

  const current = reveal ? reveal.reel[reveal.index] : null;
  const overlay = reveal && current && (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tirage au sort"
      onClick={reveal.done ? finish : undefined}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 backdrop-blur-sm"
    >
      <p className="text-sm uppercase tracking-widest text-white/60">{reveal.done ? "🎲 Tiré au sort" : "🎲 Tirage…"}</p>
      <div
        className={`aspect-[2/3] w-44 overflow-hidden rounded-xl bg-white/10 shadow-2xl transition-transform duration-300 sm:w-52 ${
          reveal.done ? "scale-110 ring-4 ring-emerald-400" : "scale-100"
        }`}
      >
        {current.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={reveal.index} src={current.posterUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-white/70">{current.title}</div>
        )}
      </div>
      <p className={`max-w-xs text-center text-lg font-semibold transition-opacity ${reveal.done ? "opacity-100" : "opacity-40"}`}>{current.title}</p>
      {reveal.done && (
        <button type="button" onClick={finish} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
          C&apos;est parti !
        </button>
      )}
    </div>
  );

  return { start, busy, error, overlay };
}
