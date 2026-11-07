"use client";

import { NEWS_BITS, NEWS_ICONS, NEWS_LABELS, type NewsKind } from "@/lib/news-shared";
import { useAction } from "../useAction";

const ORDER: NewsKind[] = ["episode", "season", "sequel", "chapter", "dlc", "provider"];

/** Types de nouveautés suivis : décochés, ils ne sont plus vérifiés ni affichés. */
export function NewsSettings({ mask, region }: { mask: number; region: string }) {
  const { run, busy, error } = useAction();
  return (
    <div className="space-y-2 text-sm">
      {ORDER.map((kind) => {
        const on = (mask & NEWS_BITS[kind]) !== 0;
        return (
          <label key={kind} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={on}
              disabled={busy !== null}
              onChange={() => run(kind, "/api/settings", { newsKinds: on ? mask & ~NEWS_BITS[kind] : mask | NEWS_BITS[kind] }, "PATCH")}
            />
            {NEWS_ICONS[kind]} {NEWS_LABELS[kind]}
            {kind === "provider" && <span className="text-xs text-white/50">(pays : {region})</span>}
          </label>
        );
      })}
      <p className="text-xs text-white/50">
        Elles s&apos;affichent sur Aujourd&apos;hui et sur la page de chaque type, et sont résumées dans la notification de la quête du jour.
        Les plateformes sont vérifiées tous les 3 jours environ, les saisons et DLC chaque semaine, les suites d&apos;anime chaque mois.
      </p>
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}
