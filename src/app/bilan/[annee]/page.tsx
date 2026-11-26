import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { BilanExport } from "@/components/bilan/BilanExport";
import { MonthChart } from "@/components/bilan/MonthChart";
import { getBilan, bilanYears } from "@/lib/bilan";
import {
  AGAIN_LABEL,
  bilanOpen,
  hoursLabel,
  mainFigure,
  MONTHS_FR,
  shortDay,
  WEEKDAYS_FR,
  type BilanStreak,
  type BilanType,
  type BilanWork,
} from "@/lib/bilan-shared";
import { starsLabel, TYPE_LABELS } from "@/lib/labels";
import { localNow } from "@/lib/local-time";
import { getSettings } from "@/lib/settings";
import { TYPE_TEXT } from "@/components/calendar/links";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ annee: string }> }): Promise<Metadata> {
  return { title: `Bilan ${(await params).annee}` };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const streakLabel = (s: BilanStreak) =>
  s.days === 0 ? "—" : s.days === 1 ? "1 jour" : `${s.days} jours${s.from && s.to ? ` (${shortDay(s.from)} → ${shortDay(s.to)})` : ""}`;

function Poster({ work, className = "w-16" }: { work: BilanWork; className?: string }) {
  return (
    <Link href={work.href} title={work.title} className={`block aspect-[2/3] shrink-0 overflow-hidden rounded-md bg-white/10 ${className}`}>
      {work.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={work.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white/60">{work.title}</span>
      )}
    </Link>
  );
}

function WorkLine({ label, work, extra }: { label: string; work: BilanWork | null; extra?: string }) {
  if (!work) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Poster work={work} className="w-8" />
      <div className="min-w-0">
        <p className="text-xs text-white/50">{label}</p>
        <p className="truncate">
          <Link href={work.href} className="hover:underline">
            {work.title}
          </Link>
          {extra && <span className="text-white/50"> · {extra}</span>}
        </p>
      </div>
    </div>
  );
}

function TypeCard({ t }: { t: BilanType }) {
  const figure = mainFigure(t);
  const best = t.top[0] ?? null;
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className={`text-sm font-semibold uppercase tracking-wide ${TYPE_TEXT[t.type]}`}>{TYPE_LABELS[t.type]}</h3>
      <div>
        <p className="text-3xl font-bold">{figure.value}</p>
        <p className="text-sm text-white/60">
          {figure.label} · {t.works} œuvre{t.works > 1 ? "s" : ""}
          {t.completed > 0 && ` · ${t.completed} terminée${t.completed > 1 ? "s" : ""}`}
        </p>
        {t.missingDurations > 0 && <p className="text-xs text-white/40">{t.missingDurations} sans durée connue, non comptés dans les heures</p>}
      </div>
      <WorkLine label="Meilleure note" work={best} extra={best?.rating ? `★ ${starsLabel(best.rating)}` : undefined} />
      <WorkLine label="Pire note" work={t.worst} extra={t.worst?.rating ? `★ ${starsLabel(t.worst.rating)}` : undefined} />
      <WorkLine label="Première activité" work={t.first?.work ?? null} extra={t.first ? shortDay(t.first.day) : undefined} />
      <WorkLine label="Dernière activité" work={t.last?.work ?? null} extra={t.last ? shortDay(t.last.day) : undefined} />
      <p className="text-sm">
        <span className="text-white/50">Plus longue série : </span>
        {streakLabel(t.streak)}
      </p>
      {t.again.activities > 0 && (
        <p className="text-sm">
          <span className="text-white/50">{capitalize(AGAIN_LABEL[t.type])} : </span>
          {t.again.works.map((w) => w.title).join(", ")}
          <span className="text-white/50"> ({t.again.activities} fois)</span>
        </p>
      )}
    </section>
  );
}

/** Bilan d'une année : top par type, chiffres par type, records, graphique des mois et export en image. */
export default async function BilanPage({ params }: { params: Promise<{ annee: string }> }) {
  const year = Number((await params).annee);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) notFound();
  const { env } = getCloudflareContext();
  const { timezone } = await getSettings(env.DB);
  const today = localNow(timezone).date;
  const current = Number(today.slice(0, 4));
  const years = [...new Set([...(await bilanYears(env.DB)), current])].filter((y) => y <= current).sort((a, b) => b - a);

  const selector = (
    <nav className="flex flex-wrap gap-2" aria-label="Années">
      {years.map((y) => (
        <Link
          key={y}
          href={`/bilan/${y}`}
          className={`rounded-lg px-3 py-1.5 text-sm ${y === year ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"} ${bilanOpen(y, today) ? "" : "opacity-60"}`}
        >
          {bilanOpen(y, today) ? y : `🔒 ${y}`}
        </Link>
      ))}
    </nav>
  );

  if (!bilanOpen(year, today)) {
    const days = Math.round((Date.parse(`${year}-12-31T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
    return (
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {selector}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20 p-10 text-center">
          <p className="text-5xl">🎁</p>
          <h1 className="mt-3 text-2xl font-bold">Ton bilan {year} ouvre le 31 décembre</h1>
          <p className="mt-2 text-white/70">
            {days > 0 ? `Encore ${days} jour${days > 1 ? "s" : ""} : ` : ""}une notification te préviendra ce jour-là à 16 h.
          </p>
        </div>
      </main>
    );
  }

  const bilan = await getBilan(env.DB, year, timezone);
  const empty = bilan.totals.activities === 0;
  const watched = bilan.totals.minutes;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      {selector}
      <header className="rounded-2xl bg-gradient-to-br from-fuchsia-500/25 via-violet-500/15 to-sky-500/25 p-6 sm:p-8">
        <p className="text-sm uppercase tracking-widest text-white/60">Bilan</p>
        <h1 className="text-4xl font-black sm:text-5xl">Ton année {year}</h1>
        {empty ? (
          <p className="mt-4 text-white/70">Aucune activité datée cette année.</p>
        ) : (
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              [hoursLabel(watched), "devant l'écran et la manette"],
              [bilan.totals.works.toLocaleString("fr-FR"), "œuvres"],
              [bilan.totals.completed.toLocaleString("fr-FR"), "terminées"],
              [bilan.totals.activeDays.toLocaleString("fr-FR"), "jours actifs"],
              [`${bilan.streak.days} j`, "plus longue série"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-3xl font-bold">{value}</dt>
                <dd className="text-sm text-white/60">{label}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {!empty && (
        <>
          {bilan.types.some((t) => t.top.length > 0 || (t.topSeasons?.length ?? 0) > 0) && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Les mieux notées</h2>
              <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
                {bilan.types.map((t) => (
                  <Fragment key={t.type}>
                    {t.top.length > 0 && (
                      <div>
                        <h3 className={`mb-2 text-sm font-semibold ${TYPE_TEXT[t.type]}`}>{TYPE_LABELS[t.type]}</h3>
                        <ol className="flex gap-3 overflow-x-auto pb-1">
                          {t.top.map((w, i) => (
                            <li key={w.entryId} className="w-24 shrink-0 sm:w-28">
                              <div className="relative">
                                <Poster work={w} className="w-full" />
                                <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 text-xs font-bold">{i + 1}</span>
                              </div>
                              <p className="mt-1 truncate text-xs" title={w.title}>
                                {w.title}
                              </p>
                              <p className="text-xs text-amber-300">★ {starsLabel(w.rating)}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {t.topSeasons && t.topSeasons.length > 0 && (
                      <div>
                        <h3 className={`mb-2 text-sm font-semibold ${TYPE_TEXT[t.type]}`}>Saisons de séries</h3>
                        <ol className="flex gap-3 overflow-x-auto pb-1">
                          {t.topSeasons.map((s, i) => (
                            <li key={`${s.work.entryId}-${s.season}`} className="w-24 shrink-0 sm:w-28">
                              <div className="relative">
                                <Poster work={s.work} className="w-full" />
                                <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 text-xs font-bold">{i + 1}</span>
                                <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 text-xs font-semibold">S{s.season}</span>
                              </div>
                              <p className="mt-1 truncate text-xs" title={`${s.work.title} · ${s.name ?? `Saison ${s.season}`}`}>
                                {s.work.title}
                              </p>
                              <p className="truncate text-xs text-white/50">{s.name ?? `Saison ${s.season}`}</p>
                              <p className="text-xs text-amber-300">★ {starsLabel(s.rating)}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Par type</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bilan.types.map((t) => (
                <TypeCard key={t.type} t={t} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 p-4">
              <h2 className="mb-3 text-lg font-semibold">Records</h2>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-white/50">Mois le plus chargé</dt>
                  <dd className="text-lg font-semibold">
                    {bilan.busiestMonth ? `${capitalize(MONTHS_FR[bilan.busiestMonth.month])} · ${bilan.busiestMonth.activities} activités` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50">Jour de la semaine le plus chargé</dt>
                  <dd className="text-lg font-semibold">
                    {bilan.busiestWeekday ? `${capitalize(WEEKDAYS_FR[bilan.busiestWeekday.weekday])} · ${bilan.busiestWeekday.activities} activités` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/50">Plus longue série, tous types</dt>
                  <dd className="text-lg font-semibold">{streakLabel(bilan.streak)}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-white/10 p-4 lg:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">Mois par mois</h2>
              <MonthChart months={bilan.months} />
            </div>
          </section>

          <BilanExport bilan={bilan} />
        </>
      )}
    </main>
  );
}
