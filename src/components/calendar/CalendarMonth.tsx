import Link from "next/link";
import type { CalendarDay } from "@/lib/calendar-shared";
import { monthWeeks } from "@/lib/calendar-shared";
import { starsLabel, TYPE_SINGULAR } from "@/lib/labels";
import { MEDIA_TYPES } from "@/lib/types";
import { htmlToPlain } from "../RichText";
import { calendarHref, TYPE_COLORS, TYPE_TEXT, type CalendarState } from "./links";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/** « Vendredi 13 novembre » */
function dayHeading(day: string): string {
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const excerpt = (html: string) => {
  const text = htmlToPlain(html).replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 160).replace(/\s+\S*$/, "")}…` : text;
};

/** Grille du mois (lundi → dimanche) et détail du jour choisi. */
export function CalendarMonth({ state, days, today }: { state: CalendarState; days: Map<string, CalendarDay>; today: string }) {
  const weeks = monthWeeks(state.month);
  const selected = state.day ? days.get(state.day) : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-[11px] text-white/50">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pl-1.5">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day, i) => {
            if (!day) return <div key={`vide-${i}`} />;
            const data = days.get(day);
            const works = data?.works ?? [];
            const types = MEDIA_TYPES.filter((t) => works.some((w) => w.type === t));
            const isSelected = day === state.day;
            return (
              <Link
                key={day}
                href={calendarHref(state, { day: isSelected ? null : day })}
                scroll={false}
                aria-label={`${dayHeading(day)} : ${works.length} œuvre${works.length > 1 ? "s" : ""}`}
                className={`relative flex h-16 flex-col rounded-lg border p-1 transition sm:h-24 sm:p-1.5 ${
                  isSelected ? "border-emerald-400 bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/10"
                }`}
              >
                <span className={`text-[11px] ${day === today ? "w-fit rounded-full bg-sky-400 px-1.5 font-semibold text-black" : "text-white/60"}`}>
                  {Number(day.slice(8))}
                </span>
                {/* Affiches : à partir de la tablette ; sur téléphone, le nombre d'œuvres. */}
                <span className="mt-1 hidden items-center gap-0.5 sm:flex">
                  {works.slice(0, 4).map((w) => (
                    <span key={w.entryId} className="aspect-[2/3] w-[22%] max-w-7 overflow-hidden rounded-sm bg-white/10">
                      {w.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                  ))}
                  {works.length > 4 && <span className="text-[10px] text-white/60">+{works.length - 4}</span>}
                </span>
                {works.length > 0 && <span className="mt-auto text-xs font-medium sm:hidden">{works.length}</span>}
                {data && data.importedAdds > 0 && (
                  <span className="absolute right-1 top-1 rounded bg-amber-400/15 px-1 text-[10px] text-amber-200" title={`${data.importedAdds} ajouts (import)`}>
                    +{data.importedAdds}
                  </span>
                )}
                <span className="absolute bottom-1 right-1 flex gap-0.5 sm:bottom-1.5 sm:left-1.5 sm:right-auto">
                  {types.map((t) => (
                    <i key={t} className={`h-1.5 w-1.5 rounded-full ${TYPE_COLORS[t]}`} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-white/10 bg-white/[0.04] p-4 lg:sticky lg:top-20">
        {!state.day ? (
          <p className="text-sm text-white/60">Choisis un jour pour voir ce que tu as vu, lu, joué ou ajouté.</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{dayHeading(state.day)}</h2>
            {!selected || (selected.works.length === 0 && selected.importedAdds === 0) ? (
              <p className="mt-1 text-sm text-white/60">Rien ce jour-là.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-white/50">
                  {selected.works.length} œuvre{selected.works.length > 1 ? "s" : ""}
                  {selected.activityCount > 0 && ` · ${selected.activityCount} activité${selected.activityCount > 1 ? "s" : ""}`}
                </p>
                {selected.importedAdds > 0 && (
                  <p className="mb-2 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                    {selected.importedAdds} ajout{selected.importedAdds > 1 ? "s" : ""} (import)
                  </p>
                )}
                <ul className="divide-y divide-white/10">
                  {selected.works.map((w) => {
                    const stars = starsLabel(w.rating);
                    return (
                      <li key={w.entryId} className="flex gap-3 py-2.5">
                        <Link href={w.href} className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded bg-white/10">
                          {w.posterUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          )}
                        </Link>
                        <div className="min-w-0 text-sm">
                          <p className="font-semibold">
                            <Link href={w.href} className="hover:underline">
                              {w.title}
                            </Link>
                            <span className={`ml-1.5 text-xs font-normal ${TYPE_TEXT[w.type]}`}>{TYPE_SINGULAR[w.type]}</span>
                          </p>
                          {w.lines.map((line) => (
                            <p key={line} className="text-xs text-white/75">
                              {line}
                            </p>
                          ))}
                          {stars && <p className="text-xs text-amber-300">★ {stars}</p>}
                          {w.review && <p className="mt-1 border-l-2 border-sky-400/40 pl-2 text-xs italic text-white/60">{excerpt(w.review)}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
