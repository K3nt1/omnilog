"use client";

import { useMemo, useRef, useState } from "react";
import { postBatch } from "@/lib/import/client";
import { buildLocgSeries, type LocgSummary } from "@/lib/import/locg-parse";
import { IMPORT_BATCH_SIZE, type ComicCandidate, type ImportItemResult, type LocgSeries } from "@/lib/import/types";
import { readZipTextFiles } from "@/lib/import/unzip";
import { readXlsxRows } from "@/lib/import/xlsx";
import { dateLabel } from "@/lib/labels";
import type { SearchResponse } from "@/lib/types";

const STATUS_LABELS: Record<ImportItemResult["status"], string> = {
  imported: "importées",
  updated: "mises à jour",
  ambiguous: "à valider",
  not_found: "introuvables",
  conflict: "en conflit",
  error: "en erreur",
};
const PENDING: ImportItemResult["status"][] = ["ambiguous", "not_found"];

/** https://comicvine.gamespot.com/absolute-batman/4050-157357/ → "157357" */
const COMICVINE_URL = /comicvine\.gamespot\.com\/[^\s]*?\/4050-(\d+)/;

const button = "rounded-lg px-4 py-2 disabled:opacity-40";

/** Import de l'export Excel de League of Comic Geeks : une série LoCG = une série Comic Vine. */
export function LocgImport({ disabled }: { disabled: boolean }) {
  const [data, setData] = useState<LocgSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportItemResult>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const byKey = useMemo(() => new Map((data?.series ?? []).map((s) => [s.key, s])), [data]);
  const busy = disabled || progress !== null;

  const record = (batch: ImportItemResult[]) =>
    setResults((current) => {
      const next = { ...current };
      for (const r of batch) next[r.key] = r;
      return next;
    });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setParseError(null);
    try {
      const files = await readZipTextFiles(await file.arrayBuffer(), (path) => path.startsWith("xl/"));
      const summary = buildLocgSeries(readXlsxRows(files));
      if (summary.series.length === 0 && summary.collected.length === 0) throw new Error("Aucun comic trouvé dans ce fichier.");
      setData(summary);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Fichier League of Comic Geeks illisible.");
    }
  }

  async function run(items: LocgSeries[]) {
    stopRef.current = false;
    const size = IMPORT_BATCH_SIZE.locg;
    setProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i += size) {
      if (stopRef.current) break;
      record(await postBatch("locg", items.slice(i, i + size)));
      setProgress({ done: Math.min(i + size, items.length), total: items.length });
    }
    setProgress(null);
  }

  async function pick(series: LocgSeries, comicId: string) {
    record(await postBatch("locg", [{ ...series, forceComicId: comicId }]));
  }

  const all = Object.values(results);
  const counts: Partial<Record<ImportItemResult["status"], number>> = {};
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const toReview = all.filter((r) => PENDING.includes(r.status) && !ignored.has(r.key));
  const errors = all.filter((r) => r.status === "error");

  return (
    <>
      <section className="mb-8 rounded-xl border border-white/10 p-5">
        <h2 className="mb-1 text-xl font-semibold">League of Comic Geeks</h2>
        <p className="mb-4 text-sm text-white/60">
          Le fichier Excel (.xlsx) de l&apos;export de ta collection. Seuls les numéros lus et leurs notes sont repris.
        </p>
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
        />
        {parseError && <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{parseError}</p>}
        {data && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-white/80">
              {data.series.length} séries · {data.counts.issues} numéros · {data.counts.read} lus · {data.counts.rated} notés
              {data.collected.length > 0 && ` · ${data.collected.length} recueils (listés plus bas)`}
            </p>
            <p className="text-xs text-white/50">
              Environ {Math.ceil(data.series.length / IMPORT_BATCH_SIZE.locg)} paquets. Comic Vine limite à 200 recherches par
              heure : si des séries finissent en erreur « limite de requêtes », réessaie-les plus tard. Les séries déjà
              reconnues ne sont pas recherchées à nouveau.
            </p>
            {progress && (
              <div className="rounded-lg border border-white/10 bg-neutral-900 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span>
                    Import : {progress.done} / {progress.total}
                  </span>
                  <button type="button" onClick={() => (stopRef.current = true)} className="rounded-md bg-white/10 px-3 py-1 hover:bg-white/20">
                    Arrêter après ce paquet
                  </button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-white/50">Garde cet onglet ouvert pendant l&apos;import.</p>
              </div>
            )}
            {all.length > 0 && (
              <p className="flex flex-wrap gap-3 text-xs">
                {(Object.entries(counts) as [ImportItemResult["status"], number][]).map(([status, n]) => (
                  <span key={status} className="rounded-md bg-white/5 px-2 py-1">
                    {n} {STATUS_LABELS[status]}
                  </span>
                ))}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run(data.series)} className={`${button} bg-white font-medium text-black hover:bg-white/90`}>
                Importer {data.series.length} séries
              </button>
              {errors.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(data.series.filter((s) => results[s.key]?.status === "error"))}
                  className={`${button} bg-white/10 hover:bg-white/20`}
                >
                  Réessayer les {errors.length} erreurs
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {toReview.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold">Comics à valider ({toReview.length})</h2>
          <p className="mb-4 text-sm text-white/60">
            Clique sur la bonne série, cherche autrement — tu peux aussi coller un lien comicvine.gamespot.com — ou ignore-la.
          </p>
          <ul className="space-y-4">
            {toReview.map((r) => {
              const series = byKey.get(r.key);
              if (!series) return null;
              return (
                <ComicReview
                  key={r.key}
                  result={r}
                  series={series}
                  disabled={busy}
                  onPick={(id) => pick(series, id)}
                  onIgnore={() => setIgnored((s) => new Set(s).add(r.key))}
                />
              );
            })}
          </ul>
        </section>
      )}

      {errors.length > 0 && !progress && (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Comics en erreur</h2>
          <ul className="space-y-1 text-sm text-red-300">
            {errors.slice(0, 50).map((r) => (
              <li key={r.key}>
                {r.label} — {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.collected.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold">Recueils à ajouter à la main ({data.collected.length})</h2>
          <p className="mb-3 text-sm text-white/60">
            Albums sans numéro (TP, HC) : ils ne sont pas importés. Cherche l&apos;édition voulue (par exemple chez Urban Comics) et
            ajoute-la à ta bibliothèque.
          </p>
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10 text-sm">
            {data.collected.map((c) => (
              <li key={`${c.series}|${c.title}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {c.title}
                  <span className="ml-2 text-xs text-white/50">
                    {[c.publisher, c.releaseDate ? dateLabel(c.releaseDate) : null, c.read ? "lu" : "pas lu"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <a
                  href={`/recherche?q=${encodeURIComponent(c.series.replace(/\s*\(.*$/, ""))}&types=comic`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-300 hover:underline"
                >
                  Chercher ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ComicReview({
  result,
  series,
  disabled,
  onPick,
  onIgnore,
}: {
  result: ImportItemResult;
  series: LocgSeries;
  disabled: boolean;
  onPick: (comicId: string) => Promise<void>;
  onIgnore: () => void;
}) {
  const [query, setQuery] = useState(series.name);
  const [extra, setExtra] = useState<ComicCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const link = query.match(COMICVINE_URL);
  const candidates = [...(result.comicCandidates ?? []), ...extra.filter((c) => !result.comicCandidates?.some((r) => r.comicId === c.comicId))];
  const read = series.issues.filter((i) => i.read).length;

  async function pick(id: string) {
    setBusy(true);
    await onPick(id);
    setBusy(false);
  }

  async function search() {
    setSearchError(null);
    if (link) {
      await pick(link[1]);
      return;
    }
    try {
      const res = await fetch(`/api/search?${new URLSearchParams({ q: query.trim(), types: "comic" })}`);
      const json = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Recherche impossible.");
      if (json.errors[0]) throw new Error(json.errors[0].message);
      setExtra(
        json.results.map((r) => ({
          comicId: r.externalId,
          title: r.title,
          year: r.year,
          publisher: r.originalTitle, // « DC Comics · 52 n° »
          issueCount: null,
          posterUrl: r.posterUrl,
        })),
      );
      if (json.results.length === 0) setSearchError("Aucun résultat. Essaie un autre nom, ou colle un lien Comic Vine.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Recherche impossible.");
    }
  }

  return (
    <li className="rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {series.label}
          <span className="ml-2 text-xs text-white/50">
            {[series.publisher, `${series.issues.length} numéro${series.issues.length > 1 ? "s" : ""}`, read > 0 ? `${read} lu${read > 1 ? "s" : ""}` : null]
              .filter(Boolean)
              .join(" · ")}
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
            <li key={c.comicId}>
              <button type="button" disabled={disabled || busy} onClick={() => pick(c.comicId)} className="group w-full text-left disabled:opacity-40" title="C'est celle-ci">
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-emerald-400 group-hover:ring-2">
                  {c.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white/40">Pas de couverture</div>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs">{c.title}</p>
                <p className="text-[11px] text-white/50">
                  {[c.year, c.publisher, c.issueCount ? `${c.issueCount} n°` : null].filter(Boolean).join(" · ")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de la série, ou lien comicvine.gamespot.com/…/4050-…"
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
        />
        <button
          type="button"
          disabled={disabled || busy || query.trim().length < 3}
          onClick={search}
          className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
        >
          {link ? "Importer ce lien" : "Chercher autrement"}
        </button>
      </div>
      {searchError && <p className="mt-2 text-xs text-red-300">{searchError}</p>}
      {busy && <p className="mt-2 text-xs text-white/50">Import…</p>}
    </li>
  );
}
