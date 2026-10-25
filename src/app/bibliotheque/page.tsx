import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { FocusBanner } from "@/components/FocusBanner";
import { LibraryBrowser } from "@/components/LibraryBrowser";
import { getFocusOverview, getLibraryPage } from "@/lib/browse";
import { parseLibraryQuery, type RawSearchParams } from "@/lib/library-url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bibliothèque" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = parseLibraryQuery(await searchParams);
  const { env } = getCloudflareContext();
  // Le bandeau « En ce moment » n'apparaît que sur la vue d'ensemble (page 1, sans filtre).
  const overview =
    query.page === 1 && !query.type && !query.status && !query.favorite && !query.rating && !query.genre && !query.search.trim();
  const [data, focus] = await Promise.all([
    getLibraryPage(env.DB, query),
    overview ? getFocusOverview(env.DB) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Bibliothèque</h1>
        <Link href="/recherche" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
          + Ajouter une œuvre
        </Link>
      </div>
      {focus && (
        <div className="mb-8">
          <FocusBanner overview={focus} />
        </div>
      )}
      <LibraryBrowser basePath="/bibliotheque" query={query} data={data} fixedType={false} />
    </main>
  );
}
