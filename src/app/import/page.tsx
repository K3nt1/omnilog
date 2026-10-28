"use client";

import { useMemo, useRef, useState } from "react";
import { buildLetterboxdFilms, type LetterboxdSummary } from "@/lib/import/letterboxd-parse";
import { parseMalXml } from "@/lib/import/mal-parse";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_CHECK_CHUNK,
  IMPORT_BACKFILL_CHUNK,
  letterboxdLinkKey,
  type ImportCheckResponse,
  type ImportItemResult,
  type ImportResponse,
  type LetterboxdFilm,
  type MalImportItem,
  type MatchCandidate,
} from "@/lib/import/types";
import { letterboxdAddedDate } from "@/lib/import/added-date";
import { readZipTextFiles } from "@/lib/import/unzip";
import type { SearchResponse } from "@/lib/types";

type Source = "mal" | "letterboxd";
type ResultMap = Record<string, ImportItemResult>;
type Pick = { tmdbId: string; type: "movie" | "tv"; allowMerge?: boolean };
interface Validated {
  film: LetterboxdFilm;
  result: ImportItemResult;
  previous: ImportItemResult | undefined;
}

const STATUS_LABELS: Record<ImportItemResult["status"], string> = {
  imported: "importés",
  updated: "mis à jour",
  ambiguous: "à valider",
  not_found: "introuvables",
  conflict: "en conflit",
  error: "en erreur",
};

const PENDING: ImportItemResult["status"][] = ["ambiguous", "not_found", "conflict"];

/** https://www.themoviedb.org/movie/603-the-matrix, /fr/tv/1399… -> { type, id } */
const TMDB_URL = /themoviedb\.org\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(movie|tv)\/(\d+)/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Décompresse un .gz dans le navigateur (export MAL parfois compressé). */
async function readMaybeGzip(file: File): Promise<string> {
  if (!file.name.endsWith(".gz")) return file.text();
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    // Page HTML au lieu de JSON : erreur Cloudflare (limite de calcul, 5xx) ou session Access expirée.
  }
  if (json === null && (res.url.includes("/cdn-cgi/access") || text.includes("cloudflareaccess.com"))) {
    throw Object.assign(new Error("Session Cloudflare Access expirée : recharge la page puis réessaie."), { status: 401 });
  }
  if (!res.ok || json === null) {
    const cloudflareCode = text.match(/Error (1\d{3})/)?.[1];
    const message =
      json?.error ??
      `Réponse inattendue du serveur (HTTP ${res.status}${cloudflareCode ? `, erreur Cloudflare ${cloudflareCode}` : ""})`;
    throw Object.assign(new Error(message), { status: res.ok ? 502 : res.status });
  }
  return json;
}

/** Délais avant chaque nouvel essai : laisse le temps à une erreur passagère de Cloudflare de se dissiper. */
const RETRY_DELAYS_MS = [3000, 10000];

async function postBatch(source: Source, items: MalImportItem[] | LetterboxdFilm[]): Promise<ImportItemResult[]> {
  let lastError = "Erreur réseau";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return (await postJson<ImportResponse>("/api/import", { source, items })).results;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erreur réseau";
      const status = (e as { status?: number }).status;
      if (status !== undefined && status < 500) break; // format refusé ou session expirée : inutile d'insister
    }
  }
  // Le paquet entier échoue : on retente œuvre par œuvre, pour ne perdre que celle qui pose problème.
  if (items.length > 1 && !lastError.startsWith("Session")) {
    const results: ImportItemResult[] = [];
    for (const item of items) results.push(...(await postBatch(source, [item] as MalImportItem[] | LetterboxdFilm[])));
    return results;
  }
  return items.map((item) => ({
    key: item.key,
    label: "name" in item ? item.name : item.title,
    status: "error" as const,
    message: lastError,
  }));
}

const filmLabel = (film: LetterboxdFilm) => (film.year ? `${film.name} (${film.year})` : film.name);

export default function ImportPage() {
  const [mal, setMal] = useState<MalImportItem[] | null>(null);
  const [lb, setLb] = useState<LetterboxdSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultMap>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [validated, setValidated] = useState<Validated[]>([]);
  const [progress, setProgress] = useState<{ source: Source; done: number; total: number } | null>(null);
  const [check, setCheck] = useState<{ running: boolean; message: string | null }>({ running: false, message: null });
  const [dates, setDates] = useState<{ running: boolean; message: string | null }>({ running: false, message: null });
  const stopRef = useRef(false);

  const filmsByKey = useMemo(() => new Map((lb?.films ?? []).map((f) => [f.key, f])), [lb]);
  const filmsByLinkKey = useMemo(() => new Map((lb?.films ?? []).map((f) => [letterboxdLinkKey(f), f])), [lb]);
  const running = progress !== null || check.running || dates.running;

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

  /** Choix manuel dans l'écran de validation. */
  async function resolveFilm(film: LetterboxdFilm, pick: Pick) {
    const previous = results[film.key];
    const [result] = await postBatch("letterboxd", [
      { ...film, forceTmdbId: pick.tmdbId, forceType: pick.type, allowMerge: pick.allowMerge },
    ]);
    record([result]);
    if (result.status === "imported" || result.status === "updated") {
      setValidated((v) => [{ film, result, previous }, ...v.filter((x) => x.film.key !== film.key)]);
    }
  }

  /** Annule un choix manuel : l'entrée revient dans la liste « à valider ». */
  async function undo(item: Validated) {
    try {
      await postJson("/api/import/undo", {
        source: "letterboxd",
        key: letterboxdLinkKey(item.film),
        refs: [...item.film.watches.map((w) => w.ref), `${letterboxdLinkKey(item.film)}#vu`],
      });
      record([
        item.previous && PENDING.includes(item.previous.status)
          ? item.previous
          : { key: item.film.key, label: filmLabel(item.film), status: "not_found", message: "Correspondance annulée" },
      ]);
      setValidated((v) => v.filter((x) => x.film.key !== item.film.key));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Annulation impossible.");
    }
  }

  /** Compare l'export à la base : liste les films Letterboxd sans correspondance. */
  async function checkMissing() {
    if (!lb) return;
    setCheck({ running: true, message: null });
    try {
      const keys = lb.films.map(letterboxdLinkKey);
      const missing: string[] = [];
      for (let i = 0; i < keys.length; i += IMPORT_CHECK_CHUNK) {
        const res = await postJson<ImportCheckResponse>("/api/import/check", {
          source: "letterboxd",
          keys: keys.slice(i, i + IMPORT_CHECK_CHUNK),
        });
        missing.push(...res.missing);
      }
      const films = missing.flatMap((k) => filmsByLinkKey.get(k) ?? []);
      record(
        films
          .filter((f) => !PENDING.includes(results[f.key]?.status))
          .map((f) => ({ key: f.key, label: filmLabel(f), status: "not_found" as const, message: "Absent de la bibliothèque" })),
      );
      const watched = films.filter((f) => f.status === "completed").length;
      const skipped = films.filter((f) => ignored.has(f.key)).length;
      setCheck({
        running: false,
        message:
          films.length === 0
            ? "Tout est là : chaque film de l'export a une correspondance."
            : `${films.length} films manquants (${watched} vus, ${films.length - watched} en watchlist)` +
              (skipped > 0 ? `, dont ${skipped} que tu as ignorés.` : ".") +
              " Ils sont listés ci-dessous.",
      });
    } catch (e) {
      setCheck({ running: false, message: e instanceof Error ? e.message : "Vérification impossible." });
    }
  }

  /**
   * Complète un import fait avant la v0.4.0, sans tout réimporter : vraie date d'ajout Letterboxd
   * (avant, c'était la date de l'import) et nom de chaque épisode vu pour les séries.
   */
  async function completeImport() {
    if (!lb) return;
    setDates({ running: true, message: null });
    const items = lb.films.map((f) => ({
      key: letterboxdLinkKey(f),
      addedDate: letterboxdAddedDate(f),
      name: f.name,
      refs: f.watches.map((w) => w.ref).slice(0, 50),
      watched: f.status === "completed",
    }));
    const done = { dates: 0, episodes: 0, removed: 0 };
    try {
      for (let i = 0; i < items.length; i += IMPORT_BACKFILL_CHUNK) {
        const res = await postJson<{ dates: number; episodes: number; removed: number }>("/api/import/backfill", {
          source: "letterboxd",
          items: items.slice(i, i + IMPORT_BACKFILL_CHUNK),
        });
        done.dates += res.dates;
        done.episodes += res.episodes;
        done.removed += res.removed;
        setDates({ running: true, message: `${Math.min(i + IMPORT_BACKFILL_CHUNK, items.length)} / ${items.length}…` });
      }
      setDates({
        running: false,
        message:
          `Terminé : ${done.dates} dates d'ajout corrigées, ${done.episodes} épisodes complétés` +
          (done.removed > 0 ? `, ${done.removed} visionnages d'épisodes non vus retirés` : "") +
          " (le reste était déjà bon).",
      });
    } catch (e) {
      setDates({
        running: false,
        message: `Arrêté après ${done.dates} dates et ${done.episodes} épisodes : ${e instanceof Error ? e.message : "erreur"}. Tu peux relancer, rien ne sera compté deux fois.`,
      });
    }
  }

  const sourceResults = (source: Source) =>
    Object.values(results).filter((r) => r.key.startsWith(source === "mal" ? "mal:" : "lb:"));

  const counts = (source: Source) => {
    const c: Partial<Record<ImportItemResult["status"], number>> = {};
    for (const r of sourceResults(source)) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  };

  const toReview = sourceResults("letterboxd").filter((r) => PENDING.includes(r.status) && !ignored.has(r.key));
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
        <p className="mb-4 text-sm text-white/60">Les exports XML des animes et des mangas (.xml ou .xml.gz).</p>
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
              {mal.filter((i) => i.kind === "anime").length} animes · {mal.filter((i) => i.kind === "manga").length}{" "}
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
                  onClick={() => runImport("letterboxd", lb.films.filter((f) => results[f.key]?.status === "error"))}
                  className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-40"
                >
                  Réessayer les {errors("letterboxd").length} erreurs
                </button>
              )}
              <button
                type="button"
                disabled={running}
                onClick={checkMissing}
                className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-40"
              >
                {check.running ? "Vérification…" : "Vérifier les films manquants"}
              </button>
              <button
                type="button"
                disabled={running}
                onClick={completeImport}
                title="Pour un import fait avant la v0.4.0 : remet la date d'ajout Letterboxd et le nom des épisodes de séries, sans tout réimporter."
                className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-40"
              >
                {dates.running ? "Complétion…" : "Compléter l'import existant"}
              </button>
            </div>
            {check.message && <p className="rounded-lg bg-white/5 px-3 py-2 text-white/80">{check.message}</p>}
            {dates.message && <p className="rounded-lg bg-white/5 px-3 py-2 text-white/80">{dates.message}</p>}
          </div>
        )}
      </section>

      {/* ---------- Validation ---------- */}
      {toReview.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold">À valider ({toReview.length})</h2>
          <p className="mb-4 text-sm text-white/60">
            Clique sur la bonne fiche (film ou série), cherche autrement — tu peux aussi coller un lien
            themoviedb.org — ou ignore l&apos;entrée.
          </p>
          <ul className="space-y-4">
            {toReview.map((r) => {
              const film = filmsByKey.get(r.key);
              if (!film) return null;
              const other = r.conflictWith ? filmsByLinkKey.get(r.conflictWith) : undefined;
              return (
                <ReviewItem
                  key={r.key}
                  result={r}
                  film={film}
                  conflictLabel={other ? filmLabel(other) : r.conflictWith}
                  disabled={running}
                  onPick={(pick) => resolveFilm(film, pick)}
                  onIgnore={() => setIgnored((s) => new Set(s).add(r.key))}
                />
              );
            })}
          </ul>
        </section>
      )}

      {validated.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold">Validés à la main ({validated.length})</h2>
          <p className="mb-3 text-sm text-white/60">Un mauvais choix ? Annule-le : l&apos;entrée revient dans la liste à valider.</p>
          <ul className="space-y-2 text-sm">
            {validated.map((v) => (
              <li key={v.film.key} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                <span>
                  {filmLabel(v.film)} <span className="text-white/40">→</span>{" "}
                  <span className="text-emerald-300">{v.result.label}</span>
                  {v.result.tmdbType === "tv" && <span className="ml-2 text-xs text-white/50">(série)</span>}
                </span>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => undo(v)}
                  className="shrink-0 rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                >
                  Annuler
                </button>
              </li>
            ))}
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
  conflictLabel,
  disabled,
  onPick,
  onIgnore,
}: {
  result: ImportItemResult;
  film: LetterboxdFilm;
  conflictLabel: string | undefined;
  disabled: boolean;
  onPick: (pick: Pick) => Promise<void>;
  onIgnore: () => void;
}) {
  const [query, setQuery] = useState(film.name);
  const [extra, setExtra] = useState<MatchCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const link = query.match(TMDB_URL);
  const conflictTmdbId = result.status === "conflict" ? result.tmdbId : undefined;
  const candidates = [
    ...(result.candidates ?? []),
    ...extra.filter((c) => !result.candidates?.some((r) => r.tmdbId === c.tmdbId && r.mediaType === c.mediaType)),
  ];

  async function pick(p: Pick) {
    setBusy(true);
    await onPick(p);
    setBusy(false);
  }

  async function search() {
    setSearchError(null);
    if (link) {
      await pick({ tmdbId: link[2], type: link[1] as "movie" | "tv" });
      return;
    }
    try {
      const params = new URLSearchParams({ q: query.trim(), types: "movie,tv" });
      const res = await fetch(`/api/search?${params}`);
      const json = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Recherche impossible.");
      setExtra(
        json.results.flatMap((r): MatchCandidate[] =>
          r.type === "movie" || r.type === "tv"
            ? [{ tmdbId: r.externalId, mediaType: r.type, title: r.title, originalTitle: r.originalTitle, year: r.year, posterUrl: r.posterUrl }]
            : [],
        ),
      );
      if (json.results.length === 0) setSearchError("Aucun résultat. Essaie le titre français ou original, ou colle un lien TMDB.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Recherche impossible.");
    }
  }

  return (
    <li className="rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {result.label}
          <span className="ml-2 text-xs text-white/50">
            {film.status === "completed" ? "vu" : "watchlist"}
            {result.status === "not_found" && ` · ${result.message ?? "aucun résultat"}`}
          </span>
          {film.uri && (
            <a href={film.uri} target="_blank" rel="noreferrer" className="ml-2 text-xs text-sky-300 hover:underline">
              Voir sur Letterboxd ↗
            </a>
          )}
        </p>
        <button type="button" onClick={onIgnore} className="text-xs text-white/50 hover:text-white">
          Ignorer
        </button>
      </div>

      {result.status === "conflict" && (
        <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {result.message} {conflictLabel && <>Autre entrée : « {conflictLabel} ».</>}
          {conflictTmdbId && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => pick({ tmdbId: conflictTmdbId, type: result.tmdbType ?? "movie", allowMerge: true })}
              className="ml-2 rounded-md bg-amber-400/20 px-2 py-0.5 text-xs hover:bg-amber-400/30 disabled:opacity-40"
            >
              C&apos;est bien la même œuvre
            </button>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {candidates.map((c) => (
            <li key={`${c.mediaType}:${c.tmdbId}`}>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => pick({ tmdbId: c.tmdbId, type: c.mediaType })}
                className="group w-full text-left disabled:opacity-40"
                title="C'est celui-ci"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-emerald-400 group-hover:ring-2">
                  {c.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white/40">
                      Pas d&apos;affiche
                    </div>
                  )}
                  {c.mediaType === "tv" && (
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">Série</span>
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
          placeholder="Titre, ou lien themoviedb.org/movie/…"
          className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
        />
        <button
          type="button"
          disabled={disabled || busy || query.trim().length < 2}
          onClick={search}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
        >
          {link ? `Importer ce lien (${link[1] === "tv" ? "série" : "film"})` : "Chercher autrement"}
        </button>
      </div>
      {searchError && <p className="mt-2 text-xs text-red-300">{searchError}</p>}
      {busy && <p className="mt-2 text-xs text-white/50">Import…</p>}
    </li>
  );
}
