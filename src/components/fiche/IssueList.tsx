"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ComicIssueResponse } from "@/lib/fiche/types";
import { dateLabel } from "@/lib/labels";
import { htmlToPlain, RichText } from "../RichText";
import { PROGRESS_EVENT, useAction } from "../useAction";
import { DateInput, datedBody } from "./DateInput";
import { StarRating } from "./StarRating";

/** « ✓ Lu le 5 oct. 2026 », ou « ✓ Lu » quand la date est inconnue (import). */
const readLabel = (read: NonNullable<ComicIssueResponse["read"]>) => (read.undated ? "✓ Lu" : `✓ Lu le ${dateLabel(read.at)}`);

type Loaded =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; issues: ComicIssueResponse[]; page: number; pages: number; total: number };

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
      ...datedBody(date),
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
              <DateInput value={date} onChange={setDate} />
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

interface PageResponse {
  issues?: ComicIssueResponse[];
  page?: number;
  pages?: number;
  total?: number;
  readCount?: number;
  error?: string;
}

/** Recherche « Aller au numéro » : une requête pour ce numéro seulement. */
type Search =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "error"; label: string; message: string }
  | { status: "done"; label: string; issues: ComicIssueResponse[] };

const pagerButton = "rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-40";

/**
 * Numéros d'une série de comics, par pages de 100 (une requête Comic Vine par page, gardée en cache) :
 * la liste s'ouvre sur la page de ton prochain numéro, et « Aller au numéro » cherche un seul numéro sans charger la liste.
 * Cocher un numéro ne coche que lui : on lit souvent des numéros isolés.
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
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [hideRead, setHideRead] = useState(false);
  const [readTotal, setReadTotal] = useState<number | null>(null);
  const openRef = useRef(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const scrollToCurrent = useRef(true);
  const pageRef = useRef<number | null>(null);
  const searchRef = useRef<string | null>(null);

  /** Page `page`, ou celle de ton prochain numéro (null). */
  const load = useCallback(
    async (page: number | null) => {
      try {
        const param = page !== null ? `page=${page}` : `autour=${currentIssue ?? 1}`;
        const res = await fetch(`/api/fiche/comics/${comicId}/numeros?${param}`);
        const json = (await res.json()) as PageResponse;
        if (!res.ok || !json.issues) throw new Error(json.error ?? "Numéros indisponibles.");
        pageRef.current = json.page ?? 0;
        setReadTotal(json.readCount ?? null);
        setState({ status: "done", issues: json.issues, page: json.page ?? 0, pages: json.pages ?? 1, total: json.total ?? json.issues.length });
      } catch (e) {
        setState({ status: "error", message: e instanceof Error ? e.message : "Numéros indisponibles." });
      }
    },
    [comicId, currentIssue],
  );

  const find = useCallback(
    async (label: string) => {
      setSearch((prev) => (prev.status === "done" && prev.label === label ? prev : { status: "loading", label }));
      try {
        const res = await fetch(`/api/fiche/comics/${comicId}/numeros?numero=${encodeURIComponent(label)}`);
        const json = (await res.json()) as PageResponse;
        if (!res.ok || !json.issues) throw new Error(json.error ?? "Recherche impossible.");
        setReadTotal(json.readCount ?? null);
        setSearch({ status: "done", label, issues: json.issues });
      } catch (e) {
        setSearch({ status: "error", label, message: e instanceof Error ? e.message : "Recherche impossible." });
      }
    },
    [comicId],
  );

  // Liste ouverte : la page affichée (et la recherche) se rechargent quand une progression est faite (ici ou ailleurs sur la page).
  useEffect(() => {
    const reload = () => {
      if (!openRef.current) return;
      if (pageRef.current !== null) void load(pageRef.current);
      if (searchRef.current !== null) void find(searchRef.current);
    };
    window.addEventListener(PROGRESS_EVENT, reload);
    return () => window.removeEventListener(PROGRESS_EVENT, reload);
  }, [load, find]);

  // À l'ouverture, la liste défile jusqu'au prochain numéro à lire ; en changeant de page, elle revient en haut.
  useEffect(() => {
    if (state.status !== "done" || !listRef.current) return;
    if (scrollToCurrent.current) {
      scrollToCurrent.current = false;
      const el = listRef.current.querySelector<HTMLElement>("[data-current]");
      if (el) listRef.current.scrollTop = el.offsetTop - listRef.current.offsetTop - 160; // le numéro d'avant reste visible
    }
  }, [state]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next && (state.status === "idle" || state.status === "error")) {
      setState({ status: "loading" });
      await load(null);
    }
  }

  async function goTo(page: number) {
    setState({ status: "loading" });
    if (listRef.current) listRef.current.scrollTop = 0;
    await load(page);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const label = query.trim().replace(/^#/, "");
    if (!label) return;
    searchRef.current = label;
    void find(label);
  }

  function clearSearch() {
    searchRef.current = null;
    setSearch({ status: "idle" });
    setQuery("");
  }

  const issues = state.status === "done" ? state.issues : [];
  const shown = hideRead ? issues.filter((i) => !i.read) : issues;
  // Prochain numéro à lire : le premier numéro numérique à partir de la position (ex. #42, ou #43 s'il n'y a pas de #42).
  const currentId =
    currentIssue !== null ? (issues.find((i) => i.number !== null && i.number >= currentIssue && !i.read)?.id ?? null) : null;
  const total = state.status === "done" ? state.total : issueCount;
  const first = state.status === "done" ? issues.find((i) => i.number !== null)?.label : undefined;
  const last = state.status === "done" ? [...issues].reverse().find((i) => i.number !== null)?.label : undefined;

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
          {readTotal !== null && readTotal > 0 && total
            ? `${readTotal} lu${readTotal > 1 ? "s" : ""} sur ${total}`
            : total
              ? `${total} numéro${total > 1 ? "s" : ""}`
              : null}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/10 px-4 py-3">
          <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`numero-${comicId}`} className="text-white/60">
              Aller au numéro
            </label>
            <input
              id={`numero-${comicId}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="decimal"
              maxLength={20}
              placeholder="742"
              className="w-24 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 outline-none focus:border-white/40"
            />
            <button type="submit" disabled={!query.trim() || search.status === "loading"} className={pagerButton}>
              {search.status === "loading" ? "…" : "Chercher"}
            </button>
            {search.status !== "idle" && (
              <button type="button" onClick={clearSearch} className="text-xs text-white/50 hover:text-white">
                Effacer
              </button>
            )}
          </form>

          {search.status === "error" && <p className="text-sm text-rose-400">{search.message}</p>}
          {search.status === "done" &&
            (search.issues.length === 0 ? (
              <p className="text-sm text-white/60">Aucun numéro « {search.label} » dans cette série.</p>
            ) : (
              <ul className="divide-y divide-white/10 rounded-lg bg-black/20 px-3" aria-label={`Numéro ${search.label}`}>
                {search.issues.map((issue) => (
                  <Issue key={`${issue.id}-${issue.read?.logId ?? "non-lu"}`} issue={issue} entryId={entryId} current={false} />
                ))}
              </ul>
            ))}

          {state.status === "loading" && <p className="text-sm text-white/60">Chargement des numéros…</p>}
          {state.status === "error" && <p className="text-sm text-rose-400">{state.message}</p>}
          {state.status === "done" &&
            (issues.length === 0 ? (
              <p className="text-sm text-white/60">Aucun numéro connu.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                  {state.pages > 1 && (
                    <>
                      <button type="button" disabled={state.page === 0} onClick={() => goTo(state.page - 1)} className={pagerButton}>
                        ‹ Précédents
                      </button>
                      <span>
                        {first && last ? `#${first} à #${last}` : `Page ${state.page + 1}`} · page {state.page + 1} sur {state.pages}
                      </span>
                      <button type="button" disabled={state.page >= state.pages - 1} onClick={() => goTo(state.page + 1)} className={pagerButton}>
                        Suivants ›
                      </button>
                    </>
                  )}
                  {issues.some((i) => i.read) && (
                    <label className="ml-auto flex items-center gap-2">
                      <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} />
                      Masquer les numéros lus
                    </label>
                  )}
                </div>
                <ul ref={listRef} className="max-h-[36rem] divide-y divide-white/10 overflow-y-auto">
                  {shown.map((issue) => (
                    <Issue key={`${issue.id}-${issue.read?.logId ?? "non-lu"}`} issue={issue} entryId={entryId} current={issue.id === currentId} />
                  ))}
                </ul>
              </>
            ))}
        </div>
      )}
    </div>
  );
}
