import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { NewsSettings } from "@/components/settings/NewsSettings";
import { RemindersEditor } from "@/components/settings/RemindersEditor";
import { getNewsKinds } from "@/lib/news";
import { listReminders } from "@/lib/reminders";
import { getSettings, REGIONS } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Réglages" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10 sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Réglages : app et notifications, rappels, fuseau horaire et pays. */
export default async function SettingsPage() {
  const { env } = getCloudflareContext();
  const [settings, reminders, newsKinds] = await Promise.all([getSettings(env.DB), listReminders(env.DB), getNewsKinds(env.DB)]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">Réglages</h1>
      <Card title="App et notifications">
        <NotificationsCard />
      </Card>
      <Card title="Rappels">
        <RemindersEditor reminders={reminders} />
      </Card>
      <Card title="Nouveautés">
        <NewsSettings key={newsKinds} mask={newsKinds} region={settings.watchRegion} />
      </Card>
      <Card title="Général">
        <GeneralSettings key={`${settings.timezone}-${settings.timezoneAuto}-${settings.watchRegion}`} settings={settings} regions={REGIONS} />
      </Card>
    </main>
  );
}
