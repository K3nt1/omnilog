"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TYPE_LABELS, TYPE_SLUGS } from "@/lib/labels";
import { MEDIA_TYPES } from "@/lib/types";

const LINKS = [
  { href: "/aujourdhui", label: "Aujourd'hui" },
  { href: "/bibliotheque", label: "Bibliothèque" },
  ...MEDIA_TYPES.map((t) => ({ href: `/${TYPE_SLUGS[t]}`, label: TYPE_LABELS[t] })),
];

const TOOLS = [
  { href: "/recherche", label: "Rechercher" },
  { href: "/import", label: "Importer" },
  { href: "/reglages", label: "Réglages" },
];

/** Nouveautés pas encore vues, relues à chaque changement de page et après « Vu » (événement de useAction). */
function useNewsCount(pathname: string): number {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onAction = () => setTick((t) => t + 1);
    window.addEventListener("omnilog:news", onAction);
    return () => window.removeEventListener("omnilog:news", onAction);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/news/count", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ count?: number }>) : { count: 0 }))
      .then((json: { count?: number }) => alive && setCount(json.count ?? 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname, tick]);
  return count;
}

/** Barre de navigation en haut de chaque page ; défile horizontalement sur mobile. */
export function Nav() {
  const pathname = usePathname();
  const newsCount = useNewsCount(pathname);
  // Une fiche (/oeuvre/films/550) allume l'onglet de son type.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`/oeuvre${href}/`);
  const linkClass = (href: string) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
      isActive(href) ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
        <Link href="/" className="mr-3 shrink-0 text-lg font-bold">
          Omnilog
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={linkClass(l.href)}>
            {l.label}
            {l.href === "/aujourdhui" && newsCount > 0 && (
              <span className="ml-1.5 rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-black" aria-label={`${newsCount} nouveautés`}>
                {newsCount > 99 ? "99+" : newsCount}
              </span>
            )}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px shrink-0 bg-white/15" aria-hidden />
        {TOOLS.map((l) => (
          <Link key={l.href} href={l.href} className={linkClass(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
