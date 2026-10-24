import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaCard } from "@/components/MediaCard";
import { getTypeOverview, type ActivityItem } from "@/lib/browse";
import type { LibraryCard } from "@/lib/browse-shared";
import { starsLabel, STATUS_SLUGS, statusLabel, TYPE_LABELS, TYPE_SLUGS, typeFromSlug } from "@/lib/labels";
import type { LibraryStatus, MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const type = typeFromSlug((await params).type);
  return { title: type ? TYPE_LABELS[type] : "Introuvable" };
}

const nf = new Intl.NumberFormat("fr-FR");

const VERB: Record<MediaType, string> = { movie: "Vu", tv: "Vu", anime: "Vu", manga: "Lu", game: "Joué" };

/** « 2025-10-12 » ou « 2025-10-12T20:00:00Z » → « 12 oct. 2025 ». */
function dateLabel(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function activityText(item: ActivityItem, type: MediaType): string {
  const when = dateLabel(item.at);
  if (item.kind === "done") return `${statusLabel("completed", type)} le ${when}`;
  if (item.logKind === "chapter" && item.chapter !== null) return `Ch. ${item.chapter.toLocaleString("fr-FR")} lu le ${when}`;
  if (item.logKind === "episode" && item.episode !== null) {
    const se = item.season !== null ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}` : `Ép. ${item.episode}`;
    return `${se} vu le ${when}`;
  }
  if (item.logKind === "session") return `Session le ${when}`;
  return `${VERB[type]} le ${when}`;
}

function Row({ title, count, cards, href }: { title: string; count: number; cards: LibraryCard[]; href: string }) {
  if (count === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {title} <span className="text-base font-normal text-white/50">{nf.format(count)}</span>
        </h2>
        <Link href={href} className="text-sm text-white/60 hover:text-white">
          {count > cards.length ? `Tout voir (${nf.format(count)}) →` : "Ouvrir en grille →"}
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
        {cards.map((card) => (
          <li key={card.entryId} className="w-28 shrink-0 snap-start sm:w-32 lg:w-36">
            <MediaCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ordre des rangées : en cours, terminés, favoris, en pause, abandonnés, puis la watchlist. */
const ROWS_BEFORE_FAVORITES: LibraryStatus[] = ["in_progress", "completed"];
const ROWS_AFTER_FAVORITES: LibraryStatus[] = ["on_hold", "dropped", "planned"];

/** Page d'un type : activité récente et une rangée par statut, chacune menant à la grille filtrée. */
export default async function TypePage({ params }: Props) {
  const type = typeFromSlug((await params).type);
  if (!type) notFound();
  const { env } = getCloudflareContext();
  const overview = await getTypeOverview(env.DB, type);
  const base = `/${TYPE_SLUGS[type]}`;
  const total = Object.values(overview.statusCounts).reduce((a, b) => a + b, 0);
  const listHref = (status: LibraryStatus | null, favorite = false) => {
    const params = new URLSearchParams();
    if (status) params.set("statut", STATUS_SLUGS[status]);
    if (favorite) params.set("favoris", "1");
    const query = params.toString();
    return `${base}/liste${query ? `?${query}` : ""}`;
  };
  const statusRow = (status: LibraryStatus) => (
    <Row
      key={status}
      title={statusLabel(status, type, true)}
      count={overview.statusCounts[status]}
      cards={overview.rows[status]}
      href={listHref(status)}
    />
  );

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">
          {TYPE_LABELS[type]} <span className="text-xl font-normal text-white/50">{nf.format(total)}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action={`${base}/liste`} className="flex">
            <input
              type="search"
              name="q"
              placeholder={`Chercher dans mes ${TYPE_LABELS[type].toLowerCase()}…`}
              aria-label={`Chercher dans mes ${TYPE_LABELS[type].toLowerCase()}`}
              className="w-56 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            />
          </form>
          <Link href={listHref(null)} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            Toute la liste
          </Link>
          <Link href="/recherche" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
            + Ajouter
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/60">
          Pas encore de {TYPE_LABELS[type].toLowerCase()} dans ta bibliothèque.{" "}
          <Link href="/recherche" className="underline">
            Ajouter une œuvre
          </Link>
        </p>
      ) : (
        <>
          {overview.activity.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">Activité récente</h2>
              <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
                {overview.activity.map((item, i) => (
                  <li key={`${item.card.entryId}-${i}`} className="w-56 shrink-0">
                    <Link
                      href={`/oeuvre/${item.card.mediaId}`}
                      className="flex gap-3 rounded-lg bg-white/5 p-2 ring-1 ring-white/10 hover:ring-white/30"
                    >
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-white/5">
                        {item.card.posterUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.card.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 text-sm">
                        <p className="line-clamp-2 font-medium leading-tight">{item.card.title}</p>
                        <p className="mt-1 text-xs text-white/60">{activityText(item, type)}</p>
                        {item.logRating !== null && (
                          <p className="text-xs text-amber-300">★ {starsLabel(item.logRating)}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ROWS_BEFORE_FAVORITES.map(statusRow)}
          <Row
            title="Favoris ♥"
            count={overview.favoriteCount}
            cards={overview.favorites}
            href={listHref(null, true)}
          />
          {ROWS_AFTER_FAVORITES.map(statusRow)}
        </>
      )}
    </main>
  );
}
