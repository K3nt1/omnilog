import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryBrowser } from "@/components/LibraryBrowser";
import { getLibraryPage } from "@/lib/browse";
import { TYPE_LABELS, TYPE_SLUGS, typeFromSlug } from "@/lib/labels";
import { cookies } from "next/headers";
import { pageSizeFor, parseViewCookie, VIEW_COOKIE } from "@/lib/browse-shared";
import { parseLibraryQuery, type RawSearchParams } from "@/lib/library-url";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const type = typeFromSlug((await params).type);
  return { title: type ? `${TYPE_LABELS[type]} · liste` : "Introuvable" };
}

/** Grille complète d'un type (/films/liste), avec les mêmes filtres que la bibliothèque. */
export default async function TypeListPage({ params, searchParams }: Props) {
  const type = typeFromSlug((await params).type);
  if (!type) notFound();
  const query = parseLibraryQuery(await searchParams, type);
  const prefs = parseViewCookie((await cookies()).get(VIEW_COOKIE)?.value);
  const { env } = getCloudflareContext();
  const data = await getLibraryPage(env.DB, query, pageSizeFor(prefs));
  const base = `/${TYPE_SLUGS[type]}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-bold">{TYPE_LABELS[type]}</h1>
        <Link href={base} className="text-sm text-white/60 underline hover:text-white">
          ← Vue d&apos;ensemble
        </Link>
      </div>
      <LibraryBrowser basePath={`${base}/liste`} query={query} data={data} fixedType prefs={prefs} />
    </main>
  );
}
