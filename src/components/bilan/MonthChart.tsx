import { MONTHS_FR, MONTHS_SHORT, TYPE_HEX } from "@/lib/bilan-shared";
import { TYPE_LABELS } from "@/lib/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";

/** Activités par mois, empilées par type (une couleur par type). */
export function MonthChart({ months }: { months: Record<MediaType, number>[] }) {
  const totals = months.map((m) => MEDIA_TYPES.reduce((n, t) => n + m[t], 0));
  const max = Math.max(1, ...totals);
  const used = MEDIA_TYPES.filter((t) => months.some((m) => m[t] > 0));
  const W = 600;
  const H = 180;
  const bar = W / 12;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Activités par mois">
        {months.map((m, i) => {
          let y = H;
          return (
            <g key={i}>
              <title>{`${MONTHS_FR[i]} : ${totals[i]} activité${totals[i] > 1 ? "s" : ""}`}</title>
              {used.map((t) => {
                const h = (m[t] / max) * (H - 14);
                y -= h;
                return h > 0 ? <rect key={t} x={i * bar + 6} y={y} width={bar - 12} height={h} fill={TYPE_HEX[t]} rx={2} /> : null;
              })}
              {totals[i] > 0 && (
                <text x={i * bar + bar / 2} y={y - 3} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.6}>
                  {totals[i]}
                </text>
              )}
              <text x={i * bar + bar / 2} y={H + 15} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.6}>
                {MONTHS_SHORT[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-white/70">
        {used.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_HEX[t] }} />
            {TYPE_LABELS[t]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
