// Point d'entrée du Worker : le site Next.js généré par OpenNext (fetch) + la tâche programmée (scheduled).
// Méthode documentée : https://opennext.js.org/cloudflare/howtos/custom-worker
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore : .open-next/worker.js n'existe qu'après « opennextjs-cloudflare build »
import { default as handler } from "./.open-next/worker.js";
import { runScheduled } from "./src/lib/cron";

export default {
  fetch: handler.fetch,

  /** Toutes les 15 minutes (wrangler.jsonc) : rappels dus, puis chaque heure les prochaines sorties. */
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runScheduled(env, new Date(controller.scheduledTime))
        .then((report) => console.log("Tâche programmée", JSON.stringify(report)))
        .catch((error) => console.error("Tâche programmée en échec", error)),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
