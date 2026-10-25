"use client";

import { useState } from "react";

const STAR_PATH =
  "M12 2.5l2.94 6.05 6.56.94-4.76 4.62 1.13 6.54L12 17.56l-5.87 3.09 1.13-6.54L2.5 9.49l6.56-.94L12 2.5z";

/** Étoile dessinée en SVG : la partie colorée est la même forme rognée, donc toujours bien alignée. */
function Star({ fill, small }: { fill: 0 | 50 | 100; small?: boolean }) {
  return (
    <span className={`relative block ${small ? "h-5 w-5" : "h-8 w-8"}`}>
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full fill-white/20" aria-hidden>
        <path d={STAR_PATH} />
      </svg>
      {fill > 0 && (
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 h-full w-full fill-amber-300"
          style={fill === 50 ? { clipPath: "inset(0 50% 0 0)" } : undefined}
          aria-hidden
        >
          <path d={STAR_PATH} />
        </svg>
      )}
    </span>
  );
}

/** Note en demi-étoiles (1 à 10 en base = 0,5 à 5 étoiles). Recliquer sur la note actuelle l'efface. */
export function StarRating({
  value,
  onChange,
  disabled,
  small = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Ma note">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="relative">
            <Star small={small} fill={shown >= star * 2 ? 100 : shown === star * 2 - 1 ? 50 : 0} />
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
        ))}
      </div>
      {!small && <span className="w-10 text-sm text-white/60">{shown ? (shown / 2).toLocaleString("fr-FR") : "—"}</span>}
    </div>
  );
}
