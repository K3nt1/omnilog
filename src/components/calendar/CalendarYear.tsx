import Link from "next/link";
import { heatLevel, heatThresholds, type YearStats } from "@/lib/calendar-shared";
import { dateLabel, TYPE_LABELS } from "@/lib/labels";
import { MEDIA_TYPES } from "@/lib/types";
import { calendarHref, TYPE_COLORS, type CalendarState } from "./links";

const LEVELS = ["bg-white/[0.07]", "bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-emerald-300"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Une case par jour façon GitHub : plus elle est verte, plus il y a eu d'activités (vu / lu / joué). */
export function CalendarYear({ state, stats, today }: { state: CalendarState; stats: YearStats; today: string }) {
  const jan1 = Date.UTC(stats.year, 0, 1);
  const start = jan1 - ((new Date(jan1).getUTCDay() + 6) % 7) * 86400_000; // lundi précédent
  const end = Date.UTC(stats.year, 11, 31);
  const weeks: number[][] = [];
  for (let t = start; t <= end; t += 7 * 86400_000) weeks.push(Array.from({ length: 7 }, (_, d) => t + d * 86400_000));
  const thresholds = heatThresholds(Object.values(stats.counts));
  const fr = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-4">
      <p className="text-white/75">
        <strong className="text-white">{fr(stats.total)}</strong> activité{stats.total > 1 ? "s" : ""} ·{" "}
        <strong className="text-white">{fr(stats.activeDays)}</strong> jour{stats.activeDays > 1 ? "s" : ""} actif{stats.activeDays > 1 ? "s" : ""} · plus longue
        série : <strong className="text-white">{stats.longestStreak}</strong> jour{stats.longestStreak > 1 ? "s" : ""} d&apos;affilée
      </p>
      {/* La grille défile seule sur petit écran ; la page, elle, ne déborde pas. */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <div className="w-max">
          <div className="ml-8 flex gap-[3px] text-[10px] text-white/50">
            {weeks.map((week, i) => {
              const monthStart = week.find((t) => new Date(t).getUTCDate() === 1 && new Date(t).getUTCFullYear() === stats.year);
              return (
                <span key={i} className="relative h-4 w-3">
                  {monthStart !== undefined && <span className="absolute left-0 whitespace-nowrap">{MONTHS[new Date(monthStart).getUTCMonth()]}</span>}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="grid w-8 grid-rows-7 gap-[3px] text-[10px] leading-3 text-white/50">
              {["lun.", "", "mer.", "", "ven.", "", ""].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            {weeks.map((week, i) => (
              <div key={i} className="grid grid-rows-7 gap-[3px]">
                {week.map((t) => {
                  const day = iso(t);
                  if (new Date(t).getUTCFullYear() !== stats.year) return <span key={day} className="h-3 w-3" />;
                  if (day > today) return <span key={day} className="h-3 w-3 rounded-[3px] bg-white/[0.03]" />;
                  const count = stats.counts[day] ?? 0;
                  return (
                    <Link
                      key={day}
                      href={calendarHref(state, { view: "mois", month: day.slice(0, 7), day })}
                      title={`${dateLabel(day)} : ${count} activité${count > 1 ? "s" : ""}`}
                      className={`h-3 w-3 rounded-[3px] hover:ring-1 hover:ring-white ${LEVELS[heatLevel(count, thresholds)]}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-white/60">
            Moins
            {LEVELS.map((c) => (
              <i key={c} className={`h-3 w-3 rounded-[3px] ${c}`} />
            ))}
            Plus
          </div>
        </div>
      </div>
      {stats.undated > 0 && (
        <p className="text-sm text-amber-200/80">
          {fr(stats.undated)} activité{stats.undated > 1 ? "s" : ""} sans date (imports, « sans date ») ne {stats.undated > 1 ? "sont" : "est"} placée
          {stats.undated > 1 ? "s" : ""} sur aucun jour.
        </p>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {MEDIA_TYPES.filter((t) => state.types.includes(t)).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <i className={`h-2 w-2 rounded-full ${TYPE_COLORS[t]}`} />
            {TYPE_LABELS[t]} <strong>{fr(stats.byType[t])}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
