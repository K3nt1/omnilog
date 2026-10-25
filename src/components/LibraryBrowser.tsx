import Link from "next/link";
import type { LibraryPage } from "@/lib/browse";
import { sortsFor, type LibraryQuery } from "@/lib/browse-shared";
import { sortDetail, STATUS_ORDER, statusLabel, TYPE_LABELS } from "@/lib/labels";
import { libraryHref } from "@/lib/library-url";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";
import { LibraryControls } from "./LibraryControls";
import { MediaCard } from "./MediaCard";
import { Pagination } from "./Pagination";

const DURATION_LABELS: Record<MediaType, string> = {
  movie: "Durée",
  tv: "Nombre d'épisodes",
  anime: "Nombre d'épisodes",
  manga: "Nombre de chapitres",
  game: "Durée de vie",
};

const nf = new Intl.NumberFormat("fr-FR");

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm transition ${
        active ? "border-white bg-white text-black" : "border-white/15 text-white/70 hover:border-white/40 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

const Count = ({ n }: { n: number }) => <span className="ml-1 opacity-60">{nf.format(n)}</span>;

interface Props {
  basePath: string;
  query: LibraryQuery;
  data: LibraryPage;
  /** Vrai sur /films/liste… : le type est imposé par la page. */
  fixedType: boolean;
}

/** Grille filtrable : filtres par type, statut, favoris, note ; recherche ; tri ; pagination. */
export function LibraryBrowser({ basePath, query, data, fixedType }: Props) {
  const href = (change: Partial<LibraryQuery>) => libraryHref(basePath, query, change, fixedType);
  const statusTotal = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  const typeTotal = Object.values(data.typeCounts).reduce((a, b) => a + b, 0);
  const filtered = query.status || query.favorite || query.rating || query.genre || query.search.trim() || (!fixedType && query.type);

  return (
    <div className="space-y-4">
      {!fixedType && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip href={href({ type: null })} active={query.type === null}>
            Tout <Count n={typeTotal} />
          </Chip>
          {MEDIA_TYPES.map((t) => (
            <Chip key={t} href={href({ type: t })} active={query.type === t}>
              {TYPE_LABELS[t]} <Count n={data.typeCounts[t]} />
            </Chip>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip href={href({ status: null })} active={query.status === null}>
          Tous statuts <Count n={statusTotal} />
        </Chip>
        {STATUS_ORDER.map((s) => (
          <Chip key={s} href={href({ status: s })} active={query.status === s}>
            {statusLabel(s, query.type, true)} <Count n={data.statusCounts[s]} />
          </Chip>
        ))}
        <Chip href={href({ favorite: !query.favorite })} active={query.favorite}>
          <span className="text-rose-400">♥</span> Favoris
        </Chip>
      </div>

      <LibraryControls
        basePath={basePath}
        query={query}
        fixedType={fixedType}
        sorts={sortsFor(query.type)}
        durationLabel={query.type ? DURATION_LABELS[query.type] : "Durée"}
        genres={data.genres}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-white/60">
        <p>
          {nf.format(data.total)} œuvre{data.total > 1 ? "s" : ""}
          {data.pageCount > 1 && ` · page ${data.page} sur ${data.pageCount}`}
        </p>
        {filtered && (
          <Link href={fixedType ? basePath : "/bibliotheque"} className="underline hover:text-white" scroll={false}>
            Effacer les filtres
          </Link>
        )}
      </div>

      {data.cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/60">
          {statusTotal === 0 && !filtered ? (
            <>
              Rien ici pour l&apos;instant.{" "}
              <Link href="/recherche" className="underline">
                Ajouter une œuvre
              </Link>
            </>
          ) : (
            query.sort === "visionnages"
              ? "Aucune œuvre vue, lue ou jouée au moins deux fois avec ces filtres."
              : "Aucune œuvre ne correspond à ces filtres."
          )}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {data.cards.map((card) => (
            <li key={card.entryId}>
              <MediaCard
                card={card}
                showType={!fixedType && query.type === null}
                detail={sortDetail(query.sort, card.type, card.sortValue)}
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={data.page} pageCount={data.pageCount} hrefFor={(page) => href({ page })} />
    </div>
  );
}
