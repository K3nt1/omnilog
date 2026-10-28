import Link from "next/link";
import type { LibraryPage } from "@/lib/browse";
import { sortsFor, type LibraryQuery, type ViewPrefs } from "@/lib/browse-shared";
import { STATUS_ORDER, statusLabel, TYPE_LABELS } from "@/lib/labels";
import { hasFilters, libraryHref } from "@/lib/library-url";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";
import { LibraryControls } from "./LibraryControls";
import { LibraryResults } from "./LibraryResults";
import { Pagination } from "./Pagination";

/** « En diffusion » n'a de sens que pour les séries, anime et mangas. */
function ongoingLabel(type: MediaType | null): string | null {
  if (type === "movie" || type === "game") return null;
  if (type === "manga") return "En cours de publication";
  if (type === null) return "En diffusion / publication";
  return "En diffusion";
}

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
  /** Grille ou liste, taille des affiches (cookie). */
  prefs: ViewPrefs;
}

/** Grille filtrable : filtres par type, statut, favoris, note ; recherche ; tri ; pagination. */
export function LibraryBrowser({ basePath, query, data, fixedType, prefs }: Props) {
  const href = (change: Partial<LibraryQuery>) => libraryHref(basePath, query, change, fixedType);
  const statusTotal = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  const typeTotal = Object.values(data.typeCounts).reduce((a, b) => a + b, 0);
  const filtered = hasFilters(query, fixedType);
  const ongoing = ongoingLabel(query.type);

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
        {(ongoing || query.ongoing) && (
          <Chip href={href({ ongoing: !query.ongoing })} active={query.ongoing}>
            {ongoing ?? "En diffusion"}
          </Chip>
        )}
        <Chip href={href({ withReview: !query.withReview })} active={query.withReview}>
          ✎ Avec critique
        </Chip>
      </div>

      <LibraryControls
        basePath={basePath}
        query={query}
        fixedType={fixedType}
        sorts={sortsFor(query.type)}
        durationLabel={query.type ? DURATION_LABELS[query.type] : "Durée"}
        genres={data.genres}
        releaseYears={data.releaseYears}
        watchYears={data.watchYears}
        tags={data.tags}
        platforms={data.platforms}
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
        <LibraryResults
          cards={data.cards}
          prefs={prefs}
          showType={!fixedType && query.type === null}
          sort={query.sort}
          type={query.type}
        />
      )}

      <Pagination page={data.page} pageCount={data.pageCount} hrefFor={(page) => href({ page })} />
    </div>
  );
}
