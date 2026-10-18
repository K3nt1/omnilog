"use client";

import { useMemo, useRef, useState } from "react";
import { buildLetterboxdFilms, type LetterboxdSummary } from "@/lib/import/letterboxd-parse";
import { parseMalXml } from "@/lib/import/mal-parse";
import { readZipTextFiles } from "@/lib/import/unzip";
import {
  IMPORT_BATCH_SIZE,
  type ImportItemResult,
  type ImportResponse,
  type LetterboxdFilm,
  type MalImportItem,
  type MatchCandidate,
} from "@/lib/import/types";
import type { SearchResponse } from "@/lib/types";

type Source = "mal" | "letterboxd";
type ResultMap = Record<string, ImportItemResult>;

const STATUS_LABELS: Record<ImportItemResult["status"], string> = {
  imported: "importés",
  updated: "mis à jour",
  ambiguous: "à valider",
  not_found: "introuvables",
  error: "en erreur",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Décompresse un .gz dans le navigateur (export MAL parfois compressé). */
async function readMaybeGzip(file: File): Promise<string> {
  if (!file.name.endsWith(".gz")) return file.text();
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function postBatch(source: Source, items: MalImportItem[] | LetterboxdFilm[]): Promise<ImportItemResult[]> {
  let lastError = "Erreur réseau";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, items }),
      });
      const json = (await res.json()) as ImportResponse & { error?: string };
      if (res.ok) return json.results;
      lastError = json.error ?? `Erreur ${res.status}`;
      if (res.status < 500) break; // erreur de format : inutile de réessayer
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erreur réseau";
    }
    await sleep(2000 * attempt);
  }
  return items.map((item) => ({
    key: item.key,
    label: "name" in item ? item.name : item.title,
    status: "error" as const,
    message: lastError,
  }));
}

export default function ImportPage() {
  const [mal, setMal] = useState<MalImportItem[] | null>(null);
  const [lb, setLb] = useState<LetterboxdSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultMap>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ source: Source; done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  const filmsByKey = useMemo(() => new Map((lb?.films ?? []).map((f) => [f.key, f])), [lb]);
  const running = progress !== null;

  function record(batch: ImportItemResult[]) {
    setResults((current) => {
      const next = { ...current };
      for (const r of batch) next[r.key] = r;
      return next;
    });
  }

  async function onMalFiles(files: FileList | null) {
    if (!files?.length) return;
    setParseError(null);
    try {
      const all: MalImportItem[] = [];
      for (const file of Array.from(files)) all.push(...parseMalXml(await readMaybeGzip(file)).items);
      if (all.length === 0) throw new Error("Aucune entrée trouvée : est-ce bien un export XML de MyAnimeList ?");
      setMal(all);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Fichier MAL illisible.");
    }
  }

  async function onLetterboxdZip(file: File | undefined) {
    if (!file) return;
    setParseError(null);
    try {
      const csvFiles = await readZipTextFiles(await file.arrayBuffer(), (path) => path.endsWith(".csv"));
      const summary = buildLetterboxdFilms(csvFiles);
      if (summary.films.length === 0) throw new Error("Aucun film trouvé : est-ce bien le ZIP d'export Letterboxd ?");
      setLb(summary);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "ZIP Letterboxd illisible.");
    }
  }

  async function runImport(source: Source, items: MalImportItem[] | LetterboxdFilm[]) {
    stopRef.current = false;
    const size = IMPORT_BATCH_SIZE[source];
    setProgress({ source, done: 0, total: items.length });
    for (let i = 0; i < items.length; i += size) {
      if (stopRef.current) break;
      const batch = items.slice(i, i + size) as MalImportItem[] | LetterboxdFilm[];
      record(await postBatch(source, batch));
      setProgress({ source, done: Math.min(i + size, items.length), total: items.length });
    }
    setProgress(null);
  }

  async function resolveFilm(film: LetterboxdFilm, tmdbId: string) {
    const [result] = await postBatch("letterboxd", [{ ...film, forceTmdbId: tmdbId }]);
    record([result]);
  }

  const sourceResults = (source: Source) =>
    Object.values(results).filter((r) => r.key.startsWith(source === "mal" ? "mal:" : "lb:"));

  const counts = (source: Source) => {
    const c: Partial<Record<ImportItemResult["status"], number>> = {};
    for (const r of sourceResults(source)) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  };

  const toReview = sourceResults("letterboxd").filter(
    (r) => (r.status === "ambiguous" || r.status === "not_found") && !ignored.has(r.key),
  );
  const errors = (source: Source) => sourceResults(source).filter((r) => r.status === "error");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Importer mes listes</h1>
      <p className="mb-8 text-sm text-white/60">
        Les fichiers sont lus dans ton navigateur, puis envoyés par petits paquets. Tu peux relancer un import à tout
        moment : rien n&apos;est créé en double, les entrées existantes sont mises à jour.
      </p>

      {parseError && <p className="mb-6 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{parseError}</p>}

      {progress && (
        <div className="sticky top-0 z-10 mb-6 rounded-xl border border-white/10 bg-neutral-900 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>
              Import {progress.source === "mal" ? "MyAnimeList" : "Letterboxd"} : {progress.done} / {progress.total}
            </span>
            <button
              type="button"
              onClick={() => (stopRef.current = true)}
              className="rounded-md bg-white/10 px-3 py-1 hover:bg-white/20"
            >
              Arrêter après ce paquet
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-white/50">Garde cet onglet ouvert pendant l&apos;import.</p>
        </div>
      )}

      {/* ---------- MyAnimeList ---------- */}
      <section className="mb-8 rounded-xl border border-white/10 p-5">
        <h2 className="mb-1 text-xl font-semibold">MyAnimeList</h2>
        <p className="mb-4 text-sm text-white/60">Les exports XML des animés et des mangas (.xml ou .xml.gz).</p>
        <input
          type="file"
          multiple
          accept=".xml,.gz"
          disabled={running}
          onChange={(e) => onMalFiles(e.target.files)}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
        />
        {mal && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-white/80">
              {mal.filter((i) => i.kind === "anime").length} animés · {mal.filter((i) => i.kind === "manga").length}{" "}
              mangas · {mal.filter((i) => i.status === "in_progress").length} en cours ·{" "}
              {mal.filter((i) => i.score).length} notés
            </p>
            <Counts counts={counts("mal")} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running}
                onClick={() => runImport("mal", mal)}
                className="rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-white/90 disabled:opacity-40"
              >
                Importer {mal.length} œuvres
              </button>
              {errors("mal").length > 0 && (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => runImport("mal", mal.filter((i) => results[i.key]?.status === "error"))}
                  className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-40"
                >
                  Réessayer les {errors("mal").length} erreurs
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- Letterboxd ---------- */}
      <section className="mb-8 rounded-xl border border-white/10 p-5">
        <h2 className="mb-1 text-xl font-semibold">Letterboxd</h2>
        <p className="mb-4 text-sm text-white/60">Le fichier ZIP tel que téléchargé depuis Letterboxd (Import &amp; Export).</p>
        <input
          type="file"
          accept=".zip"
          disabled={running}
          onChange={(e) => onLetterboxdZip(e.target.files?.[0])}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
        />
        {lb && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-white/80">
              {lb.counts.watched} vus · {lb.counts.watchlist} en watchlist · {lb.counts.diary} visionnages datés ·{" "}
              {lb.counts.reviews} critiques · {lb.counts.liked} ♥
              {lb.counts.orphans > 0 && ` · ${lb.counts.orphans} entrées sans fiche Letterboxd`}
            </p>
            <p className="text-xs text-white/50">
              Environ {Math.ceil(lb.films.length / IMPORT_BATCH_SIZE.letterboxd)} paquets : compte 15 à 25 minutes la
              première fois. Les films déjà reconnus sont ensuite retrouvés instantanément.
            </p>
            <Counts counts={counts("letterboxd")} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running}
                onClick={() => runImport("letterboxd", lb.films)}
                className="rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-white/90 disabled:opacity-40"
              >
                Importer {lb.films.length} films
              </button>
              {errors("letterboxd").length > 0 && (
                <button
                  type="button"
                  disabled={running}
                  onClick={() =>
                    runImport(
                      "letterboxd",
                      lb.films.filter((f) => results[f.key]?.status === "error"),
                    )
                  }
                  className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-40"
                >
                  Réessayer les {errors("letterboxd").length} erreurs
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- Validation ---------- */}
      {toReview.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold">À valider ({toReview.length})</h2>
          <p className="mb-4 text-sm text-white/60">
            TMDB n&apos;a pas trouvé ces films avec certitude. Clique sur le bon, cherche autrement, ou ignore-le.
          </p>
          <ul className="space-y-4">
            {toReview.map((r) => {
              const film = filmsByKey.get(r.key);
              if (!film) return null;
              return (
                <ReviewItem
                  key={r.key}
                  result={r}
                  film={film}
                  disabled={running}
                  onPick={(tmdbId) => resolveFilm(film, tmdbId)}
                  onIgnore={() => setIgnored((s) => new Set(s).add(r.key))}
                />
              );
            })}
          </ul>
        </section>
      )}

      {[...errors("mal"), ...errors("letterboxd")].length > 0 && !running && (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Erreurs</h2>
          <ul className="space-y-1 text-sm text-red-300">
            {[...errors("mal"), ...errors("letterboxd")].slice(0, 50).map((r) => (
              <li key={r.key}>
                {r.label} — {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Counts({ counts }: { counts: Partial<Record<ImportItemResult["status"], number>> }) {
  const entries = Object.entries(counts) as [ImportItemResult["status"], number][];
  if (entries.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-3 text-xs">
      {entries.map(([status, n]) => (
        <span key={status} className="rounded-md bg-white/5 px-2 py-1">
          {n} {STATUS_LABELS[status]}
        </span>
      ))}
    </p>
  );
}

function ReviewItem({
  result,
  film,
  disabled,
  onPick,
  onIgnore,
}: {
  result: ImportItemResult;
  film: LetterboxdFilm;
  disabled: boolean;
  onPick: (tmdbId: string) => Promise<void>;
  onIgnore: () => void;
}) {
  const [query, setQuery] = useState(film.name);
  const [extra, setExtra] = useState<MatchCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const candidates = [...(result.candidates ?? []), ...extra.filter((c) => !result.candidates?.some((r) => r.tmdbId === c.tmdbId))];

  async function search() {
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), types: "movie" });
      const res = await fetch(`/api/search?${params}`);
      const json = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Recherche impossible.");
      setExtra(
        json.results
          .filter((r) => r.type === "movie")
          .map((r) => ({ tmdbId: r.externalId, title: r.title, originalTitle: r.originalTitle, year: r.year, posterUrl: r.posterUrl })),
      );
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Recherche impossible.");
    }
  }

  async function pick(tmdbId: string) {
    setBusy(true);
    await onPick(tmdbId);
    setBusy(false);
  }

  return (
    <li className="rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {result.label}
          <span className="ml-2 text-xs text-white/50">
            {film.status === "completed" ? "vu" : "watchlist"}
            {result.status === "not_found" && " · aucun résultat"}
          </span>
        </p>
        <button type="button" onClick={onIgnore} className="text-xs text-white/50 hover:text-white">
          Ignorer
        </button>
      </div>

      {candidates.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {candidates.map((c) => (
            <li key={c.tmdbId}>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => pick(c.tmdbId)}
                className="group w-full text-left disabled:opacity-40"
                title="C'est celui-ci"
              >
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-emerald-400 group-hover:ring-2">
                  {c.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white/40">
                      Pas d&apos;affiche
                    </div>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs">{c.title}</p>
                <p className="text-[11px] text-white/50">{[c.year, c.originalTitle].filter(Boolean).join(" · ")}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
        />
        <button
          type="button"
          disabled={disabled || query.trim().length < 2}
          onClick={search}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
        >
          Chercher autrement
        </button>
      </div>
      {searchError && <p className="mt-2 text-xs text-red-300">{searchError}</p>}
      {busy && <p className="mt-2 text-xs text-white/50">Import…</p>}
    </li>
  );
}
