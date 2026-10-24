import Link from "next/link";
import { TYPE_LABELS, TYPE_SLUGS } from "@/lib/labels";
import { MEDIA_TYPES } from "@/lib/types";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-5xl font-bold">Omnilog</h1>
      <p className="text-white/60">Films, séries, animés, mangas et jeux, au même endroit.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/bibliotheque" className="rounded-xl bg-white px-6 py-3 font-medium text-black hover:bg-white/90">
          Ma bibliothèque
        </Link>
        <Link href="/recherche" className="rounded-xl bg-white/10 px-6 py-3 font-medium hover:bg-white/20">
          Rechercher une œuvre
        </Link>
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        {MEDIA_TYPES.map((t) => (
          <Link key={t} href={`/${TYPE_SLUGS[t]}`} className="rounded-full border border-white/15 px-3 py-1 text-white/70 hover:text-white">
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </div>
    </main>
  );
}
