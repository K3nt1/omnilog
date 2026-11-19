import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarMonth } from "@/components/calendar/CalendarMonth";
import { CalendarYear } from "@/components/calendar/CalendarYear";
import { calendarHref, toggleType, TYPE_COLORS, type CalendarState } from "@/components/calendar/links";
import { getMonth, getYear } from "@/lib/calendar";
import { isDay, isMonth, parseTypes, shiftMonth, type CalendarAction } from "@/lib/calendar-shared";
import { TYPE_LABELS } from "@/lib/labels";
import { localNow } from "@/lib/local-time";
import { getSettings } from "@/lib/settings";
import { MEDIA_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendrier" };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ACTIONS: [CalendarAction, string][] = [
  ["tout", "Tout"],
  ["vus", "Vu / lu / joué"],
  ["ajouts", "Ajouts"],
];

/** Calendrier : vue Mois (par défaut) avec le détail d'un jour, et vue Année façon GitHub. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { env } = getCloudflareContext();
  const { timezone } = await getSettings(env.DB);
  const today = localNow(timezone).date;
  const monthParam = first(params.mois);
  const month = isMonth(monthParam) ? monthParam : today.slice(0, 7);
  const dayParam = first(params.jour);
  const yearParam = Number(first(params.annee));
  const actionParam = first(params.action);
  const state: CalendarState = {
    view: first(params.vue) === "annee" ? "annee" : "mois",
    month,
    year: Number.isInteger(yearParam) && yearParam >= 1900 && yearParam <= 2200 ? yearParam : Number(today.slice(0, 4)),
    // Sans jour choisi : aujourd'hui s'il est dans le mois affiché.
    day: isDay(dayParam) && dayParam.startsWith(month) ? dayParam : !monthParam && !dayParam ? today : null,
    types: parseTypes(first(params.types)),
    action: actionParam === "vus" || actionParam === "ajouts" ? actionParam : "tout",
  };

  const monthTitle = new Date(`${state.month}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const tab = (active: boolean) => `rounded-md px-3 py-1 text-sm ${active ? "bg-white font-semibold text-black" : "text-white/70 hover:text-white"}`;
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${active ? "border-white bg-white text-black" : "border-white/15 text-white/75 hover:border-white/40"}`;
  const nav = "grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20";
  const allTypes = state.types.length === MEDIA_TYPES.length;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold">Calendrier</h1>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          <Link href={calendarHref(state, { view: "mois" })} className={tab(state.view === "mois")}>
            Mois
          </Link>
          <Link href={calendarHref(state, { view: "annee" })} className={tab(state.view === "annee")}>
            Année
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={state.view === "mois" ? calendarHref(state, { month: shiftMonth(state.month, -1), day: null }) : calendarHref(state, { year: state.year - 1 })}
            className={nav}
            aria-label="Précédent"
          >
            ‹
          </Link>
          <h2 className="w-44 text-center text-lg font-semibold first-letter:uppercase">{state.view === "mois" ? monthTitle : state.year}</h2>
          <Link
            href={state.view === "mois" ? calendarHref(state, { month: shiftMonth(state.month, 1), day: null }) : calendarHref(state, { year: state.year + 1 })}
            className={nav}
            aria-label="Suivant"
          >
            ›
          </Link>
          {(state.view === "mois" ? state.month !== today.slice(0, 7) : state.year !== Number(today.slice(0, 4))) && (
            <Link href={calendarHref(state, { month: today.slice(0, 7), year: Number(today.slice(0, 4)), day: today })} className="ml-1 text-xs text-sky-300 hover:underline">
              Aujourd&apos;hui
            </Link>
          )}
        </div>
        {state.view === "mois" && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {ACTIONS.map(([action, label]) => (
              <Link key={action} href={calendarHref(state, { action })} scroll={false} className={chip(state.action === action)}>
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {MEDIA_TYPES.map((t) => (
          <Link key={t} href={calendarHref(state, { types: toggleType(state.types, t) })} scroll={false} className={chip(!allTypes && state.types.includes(t))}>
            <i className={`h-2 w-2 rounded-full ${TYPE_COLORS[t]}`} />
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {state.view === "mois" ? (
        <CalendarMonth state={state} days={await getMonth(env.DB, state.month, { timeZone: timezone, types: state.types, action: state.action })} today={today} />
      ) : (
        <CalendarYear state={state} stats={await getYear(env.DB, state.year, { timeZone: timezone, types: state.types })} today={today} />
      )}
    </main>
  );
}
