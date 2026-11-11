"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComicIssueResponse } from "@/lib/fiche/types";
import { dateLabel } from "@/lib/labels";
import { htmlToPlain, RichText } from "../RichText";
import { PROGRESS_EVENT, useAction } from "../useAction";
import { StarRating } from "./StarRating";

/** « ✓ Lu le 5 oct. 2026 », ou « ✓ Lu » quand la date est inconnue (import). */
const readLabel = (read: NonNullable<ComicIssueResponse["read"]>) => (read.undated ? "✓ Lu" : `✓ Lu le ${dateLabel(read.at)}`);

type Loaded =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; issues: ComicIssueResponse[]; truncated: boolean };

/** Actions sur un numéro : cocher (avec note / critique), noter, écrire la critique, retirer. */
function IssueActions({ entryId, issue, number }: { entryId: number; issue: ComicIssueResponse; number: number }) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(issue.read?.rating ?? null);
  const [review, setReview] = useState(issue.read?.review ? htmlToPlain(issue.read.review) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const done = (ok: boolean) => {
    if (ok) setOpen(false);
  };
  const mark = (withDetails: boolean) =>
    run("mark", `/api/library/${entryId}/progress`, {
      kind: "markIssue",
      issue: number,
      date,
      ...(withDetails ? { rating, review: review.trim() || null } : {}),
    }).then(done);
  const save = (patch: Record<string, unknown>) => run("save", `/api/journal/${issue.read!.logId}`, patch, "PATCH").then(done);
  const button = "rounded-md px-2 py-1 text-xs disabled:opacity-50";

  return (
    <div className="space-y-1.5 text-right text-xs">
      {issue.read ? (
        <>
          <p className="text-emerald-300">{readLabel(issue.read)}</p>
          {issue.read.count > 1 && <p className="text-white/50">{issue.read.count} lectures</p>}
          <div className="flex justify-end">
            <StarRating small value={issue.read.rating} onChange={(r) => save({ rating: r })} disabled={busy !== null} />
          </div>
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => setOpen((v) => !v)} className={`${button} bg-white/10 hover:bg-white/20`}>
              {issue.read.review ? "Modifier la critique" : "Critique"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("unmark", `/api/journal/${issue.read!.logId}`, null, "DELETE").then(done)}
              className={`${button} text-white/50 hover:text-rose-300`}
            >
              Retirer
            </button>
          </div>
        </>
      ) : (
        <div className="flex justify-end gap-1">
          <button type="button" disabled={busy !== null} onClick={() => mark(false)} className={`${button} bg-white font-medium text-black hover:bg-white/90`}>
            {busy === "mark" ? "…" : "✓ Lu"}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} className={`${button} bg-white/10 hover:bg-white/20`}>
            + note, critique
          </button>
        </div>
      )}
      {open && (
        <div className="space-y-2 rounded-md bg-black/30 p-2 text-left">
          {!issue.read && (
            <div className="flex flex-wrap items-center gap-2">
              <StarRating small value={rating} onChange={setRating} />
              <input
                type="date"
                value={date}
                onChange={(ev) => setDate(ev.target.value || date)}
                className="rounded border border-white/15 bg-white/5 px-2 py-0.5"
                aria-label="Date de lecture"
              />
            </div>
          )}
          <textarea
            value={review}
            onChange={(ev) => setReview(ev.target.value)}
            rows={3}
            placeholder="Ta critique du numéro…"
            className="block w-full rounded border border-white/15 bg-white/5 px-2 py-1 text-sm outline-none focus:border-white/40"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => (issue.read ? save({ review: review.trim() || null }) : mark(true))}
            className={`${button} bg-white font-medium text-black hover:bg-white/90`}
          >
            {issue.read ? "Enregistrer" : "✓ Lu, avec note et critique"}
          </button>
        </div>
      )}
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}

function Issue({ issue, entryId, current }: { issue: ComicIssueResponse; entryId: number | null; current: boolean }) {
  return (
    <li data-current={current || undefined} className={`flex gap-3 py-3 ${current ? "-mx-2 rounded-lg bg-sky-500/10 px-2" : ""}`}>
      <div className="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded bg-white/5">
        {issue.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-xs text-white/50">
          {[`#${issue.label}`, issue.date ? dateLabel(issue.date) : null, current ? "à lire ensuite" : null].filter(Boolean).join(" · ")}
        </p>
        <p className="font-medium">{issue.name ?? `Numéro ${issue.label}`}</p>
        {issue.read?.review && <RichText text={issue.read.review} className="mt-2 border-l-2 border-sky-400/40 pl-3 text-white/80" />}
      </div>
      <div className="shrink-0 sm:w-44">
        {entryId !== null && issue.number !== null ? (
          <IssueActions entryId={entryId} issue={issue} number={issue.number} />
        ) : issue.read ? (
          <p className="text-right text-xs text-emerald-300">{readLabel(issue.read)}</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Numéros d'une série de comics : la liste se charge à l'ouverture (Comic Vine limite le nombre de requêtes).
 * Cocher un numéro coche aussi ceux d'avant, depuis l'endroit où tu en es.
 */
export function IssueList({
  comicId,
  issueCount,
  entryId,
  currentIssue,
}: {
  comicId: string;
  issueCount: number | null;
  entryId: number | null;
  /** Prochain numéro à lire (mis en avant), null si l'œuvre n'est pas suivie. */
  currentIssue: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Loaded>({ status: "idle" });
  const [hideRead, setHideRead] = useState(false);
  const openRef = useRef(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fiche/comics/${comicId}/numeros`);
      const json = (await res.json()) as { issues?: ComicIssueResponse[]; truncated?: boolean; error?: string };
      if (!res.ok || !json.issues) throw new Error(json.error ?? "Numéros indisponibles.");
      setState({ status: "done", issues: json.issues, truncated: json.truncated === true });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Numéros indisponibles." });
    }
  }, [comicId]);

  // Liste ouverte : rechargée quand une progression est faite ailleurs sur la page (ou ici).
  useEffect(() => {
    const reload = () => {
      if (openRef.current) void load();
    };
    window.addEventListener(PROGRESS_EVENT, reload);
    return () => window.removeEventListener(PROGRESS_EVENT, reload);
  }, [load]);

  // Au premier chargement, la liste défile jusqu'au prochain numéro à lire.
  useEffect(() => {
    if (state.status !== "done" || scrolled.current || !listRef.current) return;
    scrolled.current = true;
    const el = listRef.current.querySelector<HTMLElement>("[data-current]");
    if (el) listRef.current.scrollTop = el.offsetTop - listRef.current.offsetTop - 160; // le numéro d'avant reste visible
  }, [state]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next && (state.status === "idle" || state.status === "error")) {
      setState({ status: "loading" });
      await load();
    }
  }

  const issues = state.status === "done" ? state.issues : [];
  const readCount = issues.filter((i) => i.read).length;
  const shown = hideRead ? issues.filter((i) => !i.read) : issues;
  // Prochain numéro à lire : le premier numéro numérique à partir de la position (ex. #42, ou #43 s'il n'y a pas de #42).
  const currentId =
    currentIssue !== null ? (issues.find((i) => i.number !== null && i.number >= currentIssue && !i.read)?.id ?? null) : null;
  const total = state.status === "done" ? issues.length : issueCount;

  return (
    <div className="rounded-lg bg-white/5 ring-1 ring-white/10">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/5"
      >
        <span className="font-medium">
          <span className={`mr-2 inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          {open ? "Numéros" : "Afficher les numéros"}
        </span>
        <span className="text-white/60">
          {state.status === "done" && readCount > 0
            ? `${readCount} lu${readCount > 1 ? "s" : ""} sur ${total}`
            : total
              ? `${total} numéro${total > 1 ? "s" : ""}`
              : null}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-4">
          {state.status === "loading" && <p className="py-3 text-sm text-white/60">Chargement des numéros…</p>}
          {state.status === "error" && <p className="py-3 text-sm text-rose-400">{state.message}</p>}
          {state.status === "done" &&
            (issues.length === 0 ? (
              <p className="py-3 text-sm text-white/60">Aucun numéro connu.</p>
            ) : (
              <>
                {readCount > 0 && (
                  <label className="flex items-center gap-2 pt-3 text-xs text-white/60">
                    <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} />
                    Masquer les numéros lus
                  </label>
                )}
                <ul ref={listRef} className="max-h-[36rem] divide-y divide-white/10 overflow-y-auto">
                  {shown.map((issue) => (
                    <Issue key={`${issue.id}-${issue.read?.logId ?? "non-lu"}`} issue={issue} entryId={entryId} current={issue.id === currentId} />
                  ))}
                </ul>
                {state.truncated && (
                  <p className="py-2 text-xs text-white/50">Seuls les {issues.length} premiers numéros sont affichés.</p>
                )}
              </>
            ))}
        </div>
      )}
    </div>
  );
}
