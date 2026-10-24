"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ficheHref, plannedLabel, statusLabel, TYPE_LABELS } from "@/lib/labels";
import {
  MEDIA_TYPES,
  type LibraryStatus,
  type MediaType,
  type SearchResponse,
  type SearchResult,
} from "@/lib/types";

type AddState = "adding" | "error";

const CACHE_KEY = "omnilog:recherche";

/** Derniers résultats gardés dans l'onglet : au retour sur la page, ils réapparaissent sans nouvelle recherche. */
function readCache(key: string): SearchResponse | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { key: string; data: SearchResponse } | null;
    return cached?.key === key ? cached.data : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: SearchResponse) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, data }));
  } catch {
    // Stockage indisponible (navigation privée…) : la recherche sera simplement relancée.
  }
}

function parseTypes(value: string | null): Set<MediaType> {
  const types = (value ?? "").split(",").filter((t): t is MediaType => (MEDIA_TYPES as readonly string[]).includes(t));
  return new Set(types.length > 0 ? types : MEDIA_TYPES);
}

export default function Page() {
  // useSearchParams demande une frontière Suspense (la page est rendue côté navigateur).
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}

function SearchPage() {
  // La recherche vit dans l'adresse (?q=…&types=…) : le bouton retour la retrouve.
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [types, setTypes] = useState<Set<MediaType>>(() => parseTypes(params.get("types")));
  const initialKey = `${(params.get("q") ?? "").trim()}|${[...parseTypes(params.get("types"))].join(",")}`;
  const [data, setData] = useState<SearchResponse | null>(() => (typeof window === "undefined" ? null : readCache(initialKey)));
  const restoredKey = useRef(data ? initialKey : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});

  const trimmed = query.trim();
  const typesParam = [...types].join(",");
  const active = trimmed.length >= 2;

  // Recherche automatique 400 ms après la dernière frappe.
  useEffect(() => {
    const key = `${trimmed}|${typesParam}`;
    const url = trimmed ? `/recherche?${new URLSearchParams({ q: trimmed, types: typesParam })}` : "/recherche";
    if (trimmed.length < 2) {
      window.history.replaceState(null, "", url);
      return;
    }
    // Résultats restaurés au retour sur la page : affichés tout de suite, puis rafraîchis en silence
    // (une œuvre a pu être ajoutée depuis sa fiche entre-temps).
    const restored = restoredKey.current === key;
    restoredKey.current = null;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      window.history.replaceState(null, "", url);
      if (!restored) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: trimmed, types: typesParam });
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        const json = (await res.json()) as SearchResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Recherche impossible.");
        setData(json);
        writeCache(key, json);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Recherche impossible.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, restored ? 0 : 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, typesParam]);

  const grouped = useMemo(() => {
    const groups = new Map<MediaType, SearchResult[]>();
    for (const result of data?.results ?? []) {
      groups.set(result.type, [...(groups.get(result.type) ?? []), result]);
    }
    return MEDIA_TYPES.filter((t) => groups.has(t)).map((t) => [t, groups.get(t)!] as const);
  }, [data]);

  function toggleType(type: MediaType) {
    setTypes((current) => {
      const next = new Set(current);
      if (next.has(type) && next.size > 1) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function add(result: SearchResult) {
    setAddStates((s) => ({ ...s, [result.key]: "adding" }));
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: result.type, externalId: result.externalId }),
      });
      const json = (await res.json()) as { status?: LibraryStatus; error?: string };
      if (!res.ok || !json.status) throw new Error(json.error ?? "Ajout impossible.");
      const status = json.status;
      setData((current) =>
        current && {
          ...current,
          results: current.results.map((r) => (r.key === result.key ? { ...r, libraryStatus: status } : r)),
        },
      );
      setAddStates((s) => {
        const next = { ...s };
        delete next[result.key];
        return next;
      });
    } catch {
      setAddStates((s) => ({ ...s, [result.key]: "error" }));
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Rechercher</h1>

      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Un film, une série, un animé, un manga, un jeu…"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg outline-none focus:border-white/40"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {MEDIA_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => toggleType(type)}
            aria-pressed={types.has(type)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              types.has(type) ? "border-white bg-white text-black" : "border-white/20 text-white/60 hover:text-white"
            }`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {active && loading && <p className="mt-6 text-white/60">Recherche…</p>}
      {active && error && <p className="mt-6 text-red-400">{error}</p>}
      {active && data && data.errors.length > 0 && (
        <p className="mt-6 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          Résultats partiels : {data.errors.map((e) => e.message).join(" · ")}
        </p>
      )}
      {active && data && !loading && data.results.length === 0 && (
        <p className="mt-6 text-white/60">
          Aucun résultat.{trimmed.length < 3 && " Les animés et mangas demandent au moins 3 caractères."}
        </p>
      )}

      {active && grouped.map(([type, results]) => (
        <section key={type} className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">{TYPE_LABELS[type]}</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {results.map((r) => (
              <li key={r.key} className="flex flex-col">
                <Link href={ficheHref(r.type, r.externalId)} className="block aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition hover:ring-white/40">
                  {r.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs text-white/40">
                      Pas d&apos;affiche
                    </div>
                  )}
                </Link>
                <Link href={ficheHref(r.type, r.externalId)} className="mt-2 line-clamp-2 text-sm font-medium hover:underline" title={r.title}>
                  {r.title}
                </Link>
                <p className="line-clamp-1 text-xs text-white/50">
                  {[r.year, r.originalTitle].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-2">
                  {r.libraryStatus ? (
                    <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                      ✓ {statusLabel(r.libraryStatus, r.type)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => add(r)}
                      disabled={addStates[r.key] === "adding"}
                      className="w-full rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
                    >
                      {addStates[r.key] === "adding"
                        ? "Ajout…"
                        : addStates[r.key] === "error"
                          ? "Échec, réessayer"
                          : `+ ${plannedLabel(r.type)}`}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-16 border-t border-white/10 pt-4 text-xs text-white/40">
        Données : TMDB (films, séries), IGDB (jeux), MyAnimeList (animés, mangas). Ce produit utilise l&apos;API
        TMDB mais n&apos;est ni approuvé ni certifié par TMDB.
      </footer>
    </main>
  );
}