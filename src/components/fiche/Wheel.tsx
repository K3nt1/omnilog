"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

/** Largeur d'une case (px) : sert à retrouver la case au centre d'après le défilement. */
const ITEM = 56;
/** Délai sans défilement avant de retenir la case au centre. */
const SETTLE_MS = 120;
/** Après un défilement commandé (valeur changée ailleurs), le défilement qu'il provoque ne compte pas. */
const PROGRAMMATIC_MS = 700;

/**
 * Molette horizontale, comme sur MyAnimeList mobile : on fait défiler, la case au centre est retenue.
 * On peut aussi toucher une case, ou utiliser ← → au clavier. Quand `value` change d'ailleurs
 * (ex. le tome place le chapitre), la molette s'y déplace d'elle-même sans renvoyer de changement.
 */
export function Wheel({
  label,
  values,
  value,
  onChange,
  hint,
  format = (v) => v.toLocaleString("fr-FR"),
}: {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
  /** À droite du titre : « 37 tomes », « 312 chapitres »… */
  hint?: string;
  format?: (value: number) => string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreUntil = useRef(0);
  const first = useRef(true);
  const idPrefix = useId();
  const index = Math.max(0, values.indexOf(value));

  // Valeur choisie (ou changée ailleurs) : la molette se centre dessus.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const left = index * ITEM;
    if (Math.abs(el.scrollLeft - left) < 2) return;
    ignoreUntil.current = Date.now() + PROGRAMMATIC_MS;
    el.scrollTo({ left, behavior: first.current ? "instant" : "smooth" });
    first.current = false;
  }, [index]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  function onScroll() {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = scroller.current;
      if (!el || Date.now() < ignoreUntil.current) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
      if (values[i] !== undefined && values[i] !== value) onChange(values[i]);
    }, SETTLE_MS);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = values[index + step];
    if (next !== undefined) onChange(next);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-white/70">{label}</span>
        {hint && <span className="text-xs text-white/50">{hint}</span>}
      </div>
      <div className="relative">
        {/* Cadre de la case retenue, fixe au centre. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-14 -translate-x-1/2 rounded-lg border-2 border-sky-400" />
        <div
          ref={scroller}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${idPrefix}-${index}`}
          className="flex snap-x snap-mandatory overflow-x-auto py-1 outline-none [scrollbar-width:none] focus-visible:ring-1 focus-visible:ring-white/40 [&::-webkit-scrollbar]:hidden"
          style={{ paddingInline: `calc(50% - ${ITEM / 2}px)`, maskImage: "linear-gradient(90deg, transparent, black 20%, black 80%, transparent)" }}
        >
          {values.map((v, i) => (
            <button
              key={v}
              id={`${idPrefix}-${i}`}
              type="button"
              role="option"
              aria-selected={i === index}
              tabIndex={-1}
              onClick={() => onChange(v)}
              className={`h-12 shrink-0 snap-center text-lg tabular-nums ${i === index ? "font-semibold text-white" : "text-white/55 hover:text-white"}`}
              style={{ width: ITEM }}
            >
              {format(v)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
