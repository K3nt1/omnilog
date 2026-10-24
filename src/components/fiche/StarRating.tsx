"use client";

import { useState } from "react";

/** Note en demi-étoiles (1 à 10 en base = 0,5 à 5 étoiles). Recliquer sur la note actuelle l'efface. */
export function StarRating({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Ma note">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = shown >= star * 2 ? 100 : shown === star * 2 - 1 ? 50 : 0;
          return (
            <span key={star} className="relative inline-block h-8 w-8 text-3xl leading-8">
              <span className="absolute inset-0 text-white/20">★</span>
              <span className="absolute inset-0 overflow-hidden text-amber-300" style={{ width: `${fill}%` }}>
                ★
              </span>
              {[star * 2 - 1, star * 2].map((v, half) => (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  aria-label={`${(v / 2).toLocaleString("fr-FR")} étoile${v > 2 ? "s" : ""}`}
                  aria-checked={value === v}
                  role="radio"
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange(value === v ? null : v)}
                  className={`absolute inset-y-0 ${half === 0 ? "left-0" : "right-0"} w-1/2 cursor-pointer disabled:cursor-default`}
                />
              ))}
            </span>
          );
        })}
      </div>
      <span className="w-10 text-sm text-white/60">{shown ? (shown / 2).toLocaleString("fr-FR") : "—"}</span>
    </div>
  );
}
