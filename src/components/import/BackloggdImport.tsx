"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { parseBackloggdExport, type BackloggdSummary } from "@/lib/import/backloggd-parse";
import { postBatch } from "@/lib/import/client";
import { IMPORT_BATCH_SIZE, type BackloggdGame, type GameCandidate, type ImportItemResult } from "@/lib/import/types";
import { ficheHref, statusLabel } from "@/lib/labels";
import type { LibraryStatus } from "@/lib/types";

const RESULT_LABELS: Record<ImportItemResult["status"], string> = {
  imported: "importés",
  updated: "mis à jour",
  ambiguous: "à valider",
  not_found: "introuvables",
  conflict: "en conflit",
  error: "en erreur",
};
const STATUSES: LibraryStatus[] = ["in_progress", "completed", "played", "on_hold", "dropped", "planned", "wishlist"];
const button = "rounded-lg px-4 py-2 disabled:opacity-40";

/** Import de Backloggd : un script lit ton profil dans ton navigateur, puis son fichier est importé ici. */
export function BackloggdImport({ disabled }: { disabled: boolean }) {
  const [data, setData] = useState<BackloggdSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportItemResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const busy = disabled || progress !== null;

  async function copyScript() {
    try {
      const script = await (await fetch("/backloggd-export.js")).text();
      await navigator.clipboard.writeText(script);
      setCopied("Script copié.");
    } catch {
      setCopied("Copie impossible : ouvre le script avec le lien et copie-le à la main.");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setParseError(null);
    setResults({});
    try {
      const summary = parseBackloggdExport(await file.text());
      if (summary.games.length === 0) throw new Error("Aucun jeu dans ce fichier.");
      setData(summary);
    } catch (e) {
      setData(null);
      setParseError(e instanceof Error ? e.message : "Fichier Backloggd illisible.");
    }
  }

  async function run(items: BackloggdGame[]) {
    stopRef.current = false;
    const size = IMPORT_BATCH_SIZE.backloggd;
    setProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i += size) {
      if (stopRef.current) break;
      const batch = await postBatch("backloggd", items.slice(i, i + size));
      setResults((current) => {
        const next = { ...current };
        for (const r of batch) next[r.key] = r;
        return next;
      });
      setProgress({ done: Math.min(i + size, items.length), total: items.length });
    }
    setProgress(null);
  }

  const all = Object.values(results);
  const counts: Partial<Record<ImportItemResult["status"], number>> = {};
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const notFound = all.filter((r) => r.status === "not_found");
  const manual = all.filter((r) => r.manual);
  const errors = all.filter((r) => r.status === "error");
  const retry = data ? data.games.filter((g) => results[g.key]?.status === "error") : [];

  return (
    <section className="mb-8 rounded-xl border border-white/10 p-5">
      <h2 className="mb-1 text-xl font-semibold">Backloggd</h2>
      <p className="mb-3 text-sm text-white/60">
        Backloggd n&apos;a pas d&apos;export : un petit script lit ta bibliothèque, tes jeux masterisés et ton journal de sessions
        directement dans ton navigateur, puis télécharge un fichier à importer ici. Il ne fait que lire des pages de Backloggd
        avec ta session ; rien n&apos;est envoyé ailleurs.
      </p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-white/80">
        <li>
          <button type="button" onClick={copyScript} className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20">
            Copier le script
          </button>{" "}
          {copied && <span className="text-xs text-white/60">{copied}</span>}{" "}
          <a href="/backloggd-export.js" target="_blank" rel="noreferrer" className="text-xs text-sky-300 hover:underline">
            (voir le script)
          </a>
        </li>
        <li>
          Ouvre{" "}
          <a href="https://backloggd.com" target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
            backloggd.com
          </a>
          , connecté à ton compte, puis la console du navigateur (F12, onglet « Console »).
        </li>
        <li>
          Colle le script et valide avec Entrée. Si Chrome refuse le collage, tape d&apos;abord <code className="rounded bg-white/10 px-1">allow pasting</code>.
        </li>
        <li>Attends le message « Terminé » (quelques minutes) : le fichier backloggd-….json est téléchargé. Choisis-le ci-dessous.</li>
      </ol>
      <input
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
      />
      {parseError && <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{parseError}</p>}

      {data && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-white/80">
            {data.user && <>Profil {data.user} · </>}
            {data.games.length} jeux ·{" "}
            {STATUSES.filter((s) => data.counts[s])
              .map((s) => `${data.counts[s]} ${s === "wishlist" ? "en envies" : statusLabel(s, "game", (data.counts[s] ?? 0) > 1).toLowerCase()}`)
              .join(" · ")}
          </p>
          <p className="text-white/80">
            {data.counts.sessions} sessions au calendrier · {data.counts.mastered} 🏆 · {data.counts.rated} notés
            {data.orphanSessions > 0 && <span className="text-white/50"> · {data.orphanSessions} sessions de jeux absents de tes listes, ignorées</span>}
          </p>
          <p className="text-xs text-white/50">
            Les jeux sans session sont importés sans date ; chaque session garde son jour et sa durée. Relancer l&apos;import met les
            jeux à jour sans doublon.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => run(data.games)} className={`${button} bg-white font-medium text-black hover:bg-white/90`}>
              Importer {data.games.length} jeux
            </button>
            {progress && (
              <>
                <span className="text-white/70">
                  {progress.done} / {progress.total}
                </span>
                <button type="button" onClick={() => (stopRef.current = true)} className={`${button} bg-white/10 hover:bg-white/20`}>
                  Arrêter
                </button>
              </>
            )}
            {!progress && retry.length > 0 && (
              <button type="button" disabled={busy} onClick={() => run(retry)} className={`${button} bg-white/10 hover:bg-white/20`}>
                Réessayer les {retry.length} en erreur
              </button>
            )}
          </div>
          {progress && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
          )}
          {all.length > 0 && (
            <p className="text-white/80">
              {Object.entries(counts)
                .map(([status, n]) => `${n} ${RESULT_LABELS[status as ImportItemResult["status"]]}`)
                .join(" · ")}
            </p>
          )}
          {notFound.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-amber-200">
              <p>
                {notFound.length} jeu{notFound.length > 1 ? "x" : ""} introuvable{notFound.length > 1 ? "s" : ""} chez IGDB : ajoute-les via la
                recherche.
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-100/80">
                {notFound.map((r) => (
                  <li key={r.key}>
                    <Link href={`/recherche?q=${encodeURIComponent(r.label)}&types=game`} className="hover:underline">
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {manual.length > 0 && (
            <div className="space-y-2 rounded-lg bg-sky-500/10 px-4 py-3 text-sky-100">
              <p>
                {manual.length} jeu{manual.length > 1 ? "x" : ""} absent{manual.length > 1 ? "s" : ""} d&apos;IGDB, ajouté
                {manual.length > 1 ? "s" : ""} à la main avec {manual.length > 1 ? "leurs" : "sa"} sessions. Si l&apos;un d&apos;eux est en fait
                un jeu proposé, choisis-le : tout son suivi y passe.
              </p>
              <ul className="space-y-2 text-xs">
                {manual.map((r) => (
                  <ManualGame key={r.key} result={r} />
                ))}
              </ul>
            </div>
          )}
          {errors.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-lg bg-red-500/10 py-3 pl-9 pr-4 text-xs text-red-200">
              {errors.slice(0, 20).map((r) => (
                <li key={r.key}>
                  {r.label} : {r.message}
                </li>
              ))}
              {errors.length > 20 && <li>… et {errors.length - 20} autres</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Jeu ajouté à la main par l'import, avec les jeux IGDB proches pour le remplacer (« C'est celui-ci »). */
function ManualGame({ result }: { result: ImportItemResult }) {
  const [state, setState] = useState<{ busy: string | null; done: { title: string; href: string } | null; error: string | null }>({
    busy: null,
    done: null,
    error: null,
  });
  const candidates = result.gameCandidates ?? [];

  async function choose(candidate: GameCandidate) {
    if (!result.entryId) return;
    setState({ busy: candidate.externalId, done: null, error: null });
    try {
      const res = await fetch(`/api/library/${result.entryId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: candidate.externalId }),
      });
      const json = (await res.json()) as { href?: string; error?: string };
      if (!res.ok || !json.href) throw new Error(json.error ?? "Remplacement impossible.");
      setState({ busy: null, done: { title: candidate.title, href: json.href }, error: null });
    } catch (e) {
      setState({ busy: null, done: null, error: e instanceof Error ? e.message : "Remplacement impossible." });
    }
  }

  return (
    <li className="rounded-md bg-black/20 px-3 py-2">
      {state.done ? (
        <span>
          ✓ {result.label} →{" "}
          <Link href={state.done.href} className="underline">
            {state.done.title}
          </Link>
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {result.ficheId ? (
            <Link href={ficheHref("game", result.ficheId)} className="font-medium hover:underline">
              {result.label}
            </Link>
          ) : (
            <span className="font-medium">{result.label}</span>
          )}
          {candidates.length > 0 && result.entryId && <span className="text-sky-200/70">C&apos;est peut-être :</span>}
          {result.entryId &&
            candidates.map((c) => (
              <button
                key={c.externalId}
                type="button"
                disabled={state.busy !== null}
                onClick={() => choose(c)}
                className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50"
              >
                {state.busy === c.externalId ? "…" : `${c.title}${c.year ? ` (${c.year})` : ""}`}
              </button>
            ))}
        </div>
      )}
      {state.error && <p className="mt-1 text-rose-300">{state.error}</p>}
    </li>
  );
}
