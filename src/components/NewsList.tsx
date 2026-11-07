"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateLabel, TYPE_SINGULAR } from "@/lib/labels";
import { NEWS_ICONS, type NewsItem } from "@/lib/news-shared";

/** Marque des nouveautés comme vues ; sans `ids`, toutes. `keepalive` : la requête part même si on quitte la page. */
async function markSeen(ids?: number[]) {
  await fetch("/api/news/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
    keepalive: true,
  }).catch(() => undefined);
  // La pastille du menu se met à jour.
  window.dispatchEvent(new Event("omnilog:news"));
}

/** « il y a 2 h », « hier », « le 3 nov. ». */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  if (minutes < 48 * 60) return "hier";
  return `le ${dateLabel(iso)}`;
}

/** Fil des nouveautés : non vues en premier ; ouvrir une nouveauté la marque comme vue. */
export function NewsList({ items, showType = true, compact = false }: { items: NewsItem[]; showType?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const unseen = items.filter((n) => !n.seen && !seen.has(n.id));

  if (items.length === 0) {
    return <p className="text-sm text-white/50">Rien de neuf pour l&apos;instant. Les vérifications tournent plusieurs fois par heure.</p>;
  }
  return (
    <div className="space-y-2">
      {unseen.length > 1 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await markSeen();
            setSeen(new Set(items.map((n) => n.id)));
            setBusy(false);
            router.refresh();
          }}
          className="text-xs text-white/60 hover:text-white disabled:opacity-50"
        >
          ✓ Tout marquer comme vu ({unseen.length})
        </button>
      )}
      <ul className={`divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10 ${compact ? "text-xs" : "text-sm"}`}>
        {items.map((n) => {
          const isSeen = n.seen || seen.has(n.id);
          return (
            <li key={n.id} className={`flex items-center gap-3 px-3 py-2 ${isSeen ? "opacity-55" : ""}`}>
              <Link
                href={n.url}
                onClick={() => !isSeen && markSeen([n.id])}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-white/5">
                  {n.work.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.work.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium">
                    {!isSeen && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" aria-label="Nouveau" />}
                    {NEWS_ICONS[n.kind]} {n.work.title}
                  </p>
                  <p className="line-clamp-1 text-sky-300">{n.label}</p>
                  <p className="line-clamp-1 text-xs text-white/50" suppressHydrationWarning>
                    {[showType ? TYPE_SINGULAR[n.work.type] : null, n.detail, ago(n.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </Link>
              {!isSeen && (
                <button
                  type="button"
                  onClick={async () => {
                    setSeen((s) => new Set(s).add(n.id));
                    await markSeen([n.id]);
                    router.refresh();
                  }}
                  className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Vu
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
