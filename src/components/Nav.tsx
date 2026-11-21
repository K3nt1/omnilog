"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { TYPE_LABELS, TYPE_SLUGS } from "@/lib/labels";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";

const TYPE_ICONS: Record<MediaType, string> = { movie: "🎬", tv: "📺", anime: "🌸", manga: "📖", game: "🎮", comic: "🦇" };
const TYPE_LINKS = MEDIA_TYPES.map((t) => ({ type: t, href: `/${TYPE_SLUGS[t]}`, label: TYPE_LABELS[t], icon: TYPE_ICONS[t] }));
/** Entrées du menu « Plus » (téléphone) et de la roue (ordinateur) : pages moins fréquentes. */
const TOOLS = [
  { href: "/bilan", label: "Bilan", icon: "🎁" },
  { href: "/import", label: "Importer", icon: "⬇" },
  { href: "/reglages", label: "Réglages", icon: "⚙" },
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

type Menu = "library" | "tools" | "more";

/** Menu ouvert (un seul à la fois) : se ferme au clic dehors, avec Échap et en changeant de page. */
function useMenus(pathname: string) {
  const [open, setOpen] = useState<Menu | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const inside = (e.target as Element | null)?.closest?.(`[data-menu="${open}"]`);
      if (!inside) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = (menu: Menu) => setOpen((v) => (v === menu ? null : menu));
  return [open, toggle] as const;
}

const Badge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="ml-1.5 rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-black" aria-label={`${count} nouveautés`}>
      {count > 99 ? "99+" : count}
    </span>
  ) : null;

/**
 * Navigation. Ordinateur : barre en haut (Aujourd'hui, Bibliothèque ▾ avec chaque type, Calendrier, recherche, roue).
 * Téléphone : logo en haut, barre d'onglets en bas (Aujourd'hui, Bibliothèque, Rechercher, Calendrier, Plus).
 */
export function Nav({ version }: { version: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const newsCount = useNewsCount(pathname);
  const [menu, toggleMenu] = useMenus(pathname);
  const [counts, setCounts] = useState<{ counts: Record<MediaType, number>; total: number } | null>(null);
  const [query, setQuery] = useState("");

  // Nombre d'œuvres par type : chargé à la première ouverture du menu Bibliothèque.
  useEffect(() => {
    if (menu !== "library" || counts) return;
    fetch("/api/library/counts")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setCounts(json as { counts: Record<MediaType, number>; total: number }))
      .catch(() => undefined);
  }, [menu, counts]);

  // Une fiche (/oeuvre/films/550) et les pages de type comptent comme « Bibliothèque ».
  const inLibrary =
    pathname.startsWith("/bibliotheque") || TYPE_LINKS.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`) || pathname.startsWith(`/oeuvre${l.href}/`));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const top = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"}`;
  const item = "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm text-white/85 hover:bg-white/10";
  const fr = (n: number) => n.toLocaleString("fr-FR");

  const tab = (href: string, icon: ReactNode, label: string, active: boolean, extra?: ReactNode) => (
    <Link href={href} className={`flex flex-col items-center gap-0.5 py-1 text-[10px] ${active ? "text-sky-300" : "text-white/70"}`}>
      <span className="relative text-xl leading-none">
        {icon}
        {extra}
      </span>
      {label}
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
          <Link href="/" className="mr-3 shrink-0 text-lg font-bold">
            Omnilog
          </Link>

          {/* Ordinateur et tablette */}
          <div className="hidden flex-1 items-center gap-1 md:flex">
            <Link href="/aujourdhui" className={top(isActive("/aujourdhui"))}>
              Aujourd&apos;hui
              <Badge count={newsCount} />
            </Link>
            <div data-menu="library" className="relative">
              <button type="button" aria-expanded={menu === "library"} aria-haspopup="menu" onClick={() => toggleMenu("library")} className={top(inLibrary)}>
                Bibliothèque ▾
              </button>
              {menu === "library" && (
                <div role="menu" className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-white/15 bg-neutral-900 p-1.5 shadow-2xl">
                  <Link role="menuitem" href="/bibliotheque" className={item}>
                    Tout <span className="text-xs text-white/50">{counts ? fr(counts.total) : ""}</span>
                  </Link>
                  <div className="my-1 h-px bg-white/10" />
                  {TYPE_LINKS.map((l) => (
                    <Link key={l.href} role="menuitem" href={l.href} className={item}>
                      <span>
                        <span className="mr-2">{l.icon}</span>
                        {l.label}
                      </span>
                      <span className="text-xs text-white/50">{counts ? fr(counts.counts[l.type]) : ""}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link href="/calendrier" className={top(isActive("/calendrier"))}>
              Calendrier
            </Link>
            <Link href="/bilan" className={top(isActive("/bilan"))}>
              Bilan
            </Link>
            <span className="flex-1" />
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(query.trim() ? `/recherche?q=${encodeURIComponent(query.trim())}` : "/recherche");
                setQuery("");
              }}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔍 Rechercher un film, une série…"
                aria-label="Rechercher"
                className="w-56 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none placeholder:text-white/40 focus:border-white/40 lg:w-72"
              />
            </form>
            <div data-menu="tools" className="relative">
              <button
                type="button"
                aria-expanded={menu === "tools"}
                aria-haspopup="menu"
                aria-label="Importer, réglages"
                onClick={() => toggleMenu("tools")}
                className={`grid h-8 w-8 place-items-center rounded-lg ${isActive("/import") || isActive("/reglages") ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
              >
                ⚙
              </button>
              {menu === "tools" && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/15 bg-neutral-900 p-1.5 shadow-2xl">
                  {TOOLS.filter((l) => l.href !== "/bilan").map((l) => (
                    <Link key={l.href} role="menuitem" href={l.href} className={item}>
                      <span>
                        <span className="mr-2">{l.icon}</span>
                        {l.label}
                      </span>
                    </Link>
                  ))}
                  <div className="my-1 h-px bg-white/10" />
                  <p className="px-2.5 py-1 text-xs text-white/40">Omnilog v{version}</p>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* Téléphone : barre d'onglets en bas */}
      <div data-menu="more" className="md:hidden">
        {menu === "more" && (
          <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 rounded-t-2xl border-t border-white/15 bg-neutral-900 p-3 shadow-2xl">
            <div className="grid grid-cols-3 gap-2">
              {[...TYPE_LINKS, ...TOOLS].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs ${isActive(l.href) ? "bg-white/20" : "bg-white/5 hover:bg-white/10"}`}
                >
                  <span className="text-xl leading-none">{l.icon}</span>
                  {l.label}
                </Link>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-white/40">Omnilog v{version}</p>
          </div>
        )}
        <nav
          aria-label="Navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur"
        >
          {tab(
            "/aujourdhui",
            "☀",
            "Aujourd'hui",
            isActive("/aujourdhui"),
            newsCount > 0 ? (
              <span className="absolute -right-3 -top-1 rounded-full bg-sky-500 px-1 text-[9px] font-semibold text-black">{newsCount > 99 ? "99+" : newsCount}</span>
            ) : null,
          )}
          {tab("/bibliotheque", "📚", "Bibliothèque", inLibrary && menu !== "more")}
          {tab("/recherche", "🔍", "Rechercher", isActive("/recherche"))}
          {tab("/calendrier", "📅", "Calendrier", isActive("/calendrier"))}
          <button
            type="button"
            aria-expanded={menu === "more"}
            onClick={() => toggleMenu("more")}
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] ${menu === "more" || isActive("/import") || isActive("/reglages") ? "text-sky-300" : "text-white/70"}`}
          >
            <span className="text-xl leading-none">☰</span>
            Plus
          </button>
        </nav>
      </div>
    </>
  );
}
