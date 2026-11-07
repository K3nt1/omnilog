import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { FocusBanner } from "@/components/FocusBanner";
import { NewsList } from "@/components/NewsList";
import { MediaCard } from "@/components/MediaCard";
import { TodayReminders } from "@/components/TodayReminders";
import { getFocusOverview } from "@/lib/browse";
import { listNews } from "@/lib/news";
import { getToday } from "@/lib/today";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aujourd'hui" };

/** « mardi 3 novembre » / « Aujourd'hui » / « Demain » pour un jour AAAA-MM-JJ. */
function dayTitle(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  const d = new Date(`${day}T12:00:00Z`);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  if (day === tomorrow) return "Demain";
  if (day < today) return "Hier";
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Aujourd'hui : ouverte en touchant une notification. La quête du jour (tes focus, avec leur action rapide),
 * les rappels du jour à cocher, les nouveautés et les sorties de la semaine pour ce que tu suis.
 */
export default async function TodayPage() {
  const { env } = getCloudflareContext();
  const [today, focus, news] = await Promise.all([getToday(env.DB), getFocusOverview(env.DB), listNews(env.DB, { limit: 40 })]);
  const heading = new Date(`${today.date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const days = [...new Set(today.releases.map((r) => r.day))];

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-4 py-8">
      <div>
        <p className="text-sm uppercase tracking-wide text-white/50">{heading}</p>
        <h1 className="text-3xl font-bold">Aujourd&apos;hui</h1>
      </div>

      <FocusBanner overview={focus} />

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Rappels du jour</h2>
          <Link href="/reglages" className="text-sm text-white/60 hover:text-white">
            Gérer les rappels →
          </Link>
        </div>
        <TodayReminders reminders={today.reminders} date={today.date} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Nouveautés</h2>
          <Link href="/reglages" className="text-sm text-white/60 hover:text-white">
            Choisir les nouveautés →
          </Link>
        </div>
        <NewsList key={news.map((n) => `${n.id}${n.seen ? "v" : ""}`).join(",")} items={news} />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Sorties de la semaine</h2>
        {days.length === 0 ? (
          <p className="text-sm text-white/50">
            Rien d&apos;annoncé cette semaine pour ce que tu suis. Les dates se mettent à jour toutes les heures pour les œuvres en
            diffusion de ta bibliothèque.
          </p>
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-medium text-white/70">{dayTitle(day, today.date)}</h3>
                <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {today.releases
                    .filter((r) => r.day === day)
                    .map(({ card }) => (
                      <li key={card.entryId}>
                        <MediaCard card={card} showType />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
