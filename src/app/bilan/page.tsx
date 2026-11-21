import { getCloudflareContext } from "@opennextjs/cloudflare";
import { redirect } from "next/navigation";
import { latestBilanYear } from "@/lib/bilan-shared";
import { localNow } from "@/lib/local-time";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** /bilan → le dernier bilan ouvert (l'année en cours à partir du 31 décembre). */
export default async function BilanIndex() {
  const { env } = getCloudflareContext();
  const { timezone } = await getSettings(env.DB);
  redirect(`/bilan/${latestBilanYear(localNow(timezone).date)}`);
}
