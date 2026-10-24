"use client";

import { useState } from "react";
import type { LibraryEntry } from "@/lib/entry";
import { clockLabel, durationLabel, positionLine, statusLabel } from "@/lib/labels";
import type { MediaType, SeasonInfo } from "@/lib/types";
import { useAction } from "../useAction";

/** « 1:12:30 », « 72:30 » ou « 45 » (minutes) → secondes ; null si illisible. */
export function parseClock(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

const today = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
const field = "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40";
const primary = "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50";
const secondary = "rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50";

interface Props {
  entry: LibraryEntry;
  type: MediaType;
  seasons: SeasonInfo[];
  totalEpisodes: number | null;
  totalChapters: number | null;
}

/** « Ma progression » sur la fiche : avancer, mettre en pause, enregistrer une session, terminer, annuler, focus. */
export function ProgressPanel({ entry, type, seasons, totalEpisodes, totalChapters }: Props) {
  const { run, busy, error } = useAction();
  const url = `/api/library/${entry.id}/progress`;
  const act = (id: string, body: Record<string, unknown>) => run(id, url, body);
  const [date, setDate] = useState(today());
  const [pause, setPause] = useState(entry.pauseSeconds !== null ? clockLabel(entry.pauseSeconds) : "");
  const [page, setPage] = useState(entry.pausePage ? String(entry.pausePage) : "");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const regular = seasons.filter((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const [season, setSeason] = useState(entry.currentSeason ?? regular[0]?.seasonNumber ?? 1);
  const [episode, setEpisode] = useState(entry.currentEpisode ?? 1);
  const [chapter, setChapter] = useState(entry.currentChapter ?? 1);

  const done = entry.status === "completed";
  const dateField = (
    <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className={field} aria-label="Date" />
  );

  // Ce que « ✓ » valide ensuite.
  const next =
    type === "tv"
      ? `S${pad(entry.currentSeason ?? 1)}E${pad(entry.currentEpisode ?? 1)}`
      : type === "anime"
        ? `épisode ${entry.currentEpisode ?? 1}${totalEpisodes ? ` / ${totalEpisodes}` : ""}`
        : type === "manga"
          ? `chapitre ${(entry.currentChapter ?? 1).toLocaleString("fr-FR")}${totalChapters ? ` / ${totalChapters}` : ""}`
          : null;

  const savePause = () => {
    if (type === "manga") {
      const p = Number(page);
      if (Number.isInteger(p) && p > 0) act("pause", { kind: "pause", page: p });
      return;
    }
    const seconds = parseClock(pause);
    if (seconds !== null) act("pause", { kind: "pause", seconds });
  };

  return (
    <section id="progression" className="scroll-mt-20 rounded-xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Ma progression">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Ma progression{" "}
          <span className="text-sm font-normal text-sky-300">
            {done ? statusLabel("completed", type) : positionLine({ ...entry, type })}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {entry.canUndo && (
            <button type="button" onClick={() => act("undo", { kind: "undo" })} disabled={busy !== null} className={secondary}>
              {busy === "undo" ? "…" : "↶ Annuler la dernière progression"}
            </button>
          )}
          {!done && (
            <button
              type="button"
              onClick={() => run("focus", `/api/library/${entry.id}/focus`, { focus: !entry.isFocus })}
              disabled={busy !== null}
              className={`${secondary} ${entry.isFocus ? "ring-1 ring-sky-400/60" : ""}`}
            >
              {busy === "focus" ? "…" : entry.isFocus ? "🎯 En ce moment · retirer" : "🎯 Mettre en focus"}
            </button>
          )}
        </div>
      </div>

      {!done && next && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => act("step", { kind: type === "manga" ? "chapter" : "episode", date })}
            disabled={busy !== null}
            className={primary}
          >
            {busy === "step" ? "…" : `✓ ${type === "manga" ? "Lu" : "Vu"} : ${next}`}
          </button>
          {dateField}
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-sky-300 hover:underline">
            {editing ? "Fermer" : type === "manga" ? "Changer de chapitre" : "Changer d'épisode"}
          </button>
        </div>
      )}

      {!done && editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {type === "tv" && (
            <>
              <label className="flex items-center gap-1">
                Saison
                <select value={season} onChange={(e) => { setSeason(Number(e.target.value)); setEpisode(1); }} className={field}>
                  {(regular.length > 0 ? regular : [{ seasonNumber: season, episodeCount: 99 } as SeasonInfo]).map((s) => (
                    <option key={s.seasonNumber} value={s.seasonNumber}>
                      {s.seasonNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                Épisode
                <select value={episode} onChange={(e) => setEpisode(Number(e.target.value))} className={field}>
                  {Array.from({ length: regular.find((s) => s.seasonNumber === season)?.episodeCount ?? 99 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {type === "anime" && (
            <label className="flex items-center gap-1">
              Épisode
              <input type="number" min={1} max={totalEpisodes ?? undefined} value={episode} onChange={(e) => setEpisode(Number(e.target.value))} className={`${field} w-24`} />
            </label>
          )}
          {type === "manga" && (
            <label className="flex items-center gap-1">
              Chapitre
              <input type="number" min={0} step="any" value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className={`${field} w-28`} />
            </label>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              const ok = await act("position", { kind: "position", season, episode, chapter });
              if (ok) setEditing(false);
            }}
            className={secondary}
          >
            Reprendre ici
          </button>
          <span className="text-xs text-white/50">Rien n&apos;est ajouté au journal : c&apos;est juste l&apos;endroit où tu en es.</span>
        </div>
      )}

      {/* Pause : film / épisode (minutage) ou page (manga). */}
      {!done && type !== "game" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/70">⏸ {type === "manga" ? "Page" : "Pause à"}</span>
          {type === "manga" ? (
            <input type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} placeholder="12" className={`${field} w-24`} />
          ) : (
            <input value={pause} onChange={(e) => setPause(e.target.value)} placeholder="1:12:30" className={`${field} w-28`} aria-label="Minutage" />
          )}
          <button type="button" onClick={savePause} disabled={busy !== null} className={secondary}>
            {busy === "pause" ? "…" : "Enregistrer la pause"}
          </button>
          {(entry.pauseSeconds !== null || entry.pausePage !== null) && (
            <button type="button" onClick={() => act("clear", { kind: "clearPause" })} disabled={busy !== null} className="text-xs text-white/50 hover:text-white">
              Effacer la pause
            </button>
          )}
        </div>
      )}

      {/* Jeu : session. */}
      {type === "game" && !done && (
        <div className="space-y-2 text-sm">
          <p className="text-white/70">
            {entry.sessionsCount > 0
              ? `${entry.sessionsCount} session${entry.sessionsCount > 1 ? "s" : ""}${entry.playtimeMinutes ? ` · ${durationLabel(entry.playtimeMinutes)} au total` : ""}${entry.gameCheckpoint ? ` · Où j'en suis : ${entry.gameCheckpoint}` : ""}`
              : "Aucune session pour l'instant."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {dateField}
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Durée (1:30 ou 90)" className={`${field} w-40`} aria-label="Durée de la session" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Où j'en suis (facultatif)" maxLength={500} className={`${field} min-w-48 flex-1`} />
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const seconds = minutes.trim() ? parseClock(minutes.includes(":") ? `${minutes}:00` : minutes) : null;
                const ok = await act("session", { kind: "session", date, minutes: seconds !== null ? Math.round(seconds / 60) : undefined, note });
                if (ok) {
                  setMinutes("");
                  setNote("");
                }
              }}
              className={primary}
            >
              {busy === "session" ? "…" : "+ J'ai fait une session"}
            </button>
          </div>
        </div>
      )}

      {/* Terminer. */}
      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-sm">
          <button type="button" onClick={() => act("complete", { kind: "complete", date })} disabled={busy !== null} className={secondary}>
            {busy === "complete" ? "…" : `✓ ${type === "movie" ? "Vu" : "Terminé"}`}
          </button>
          {type !== "tv" && type !== "anime" && type !== "manga" && dateField}
          <span className="text-xs text-white/50">
            {type === "movie" ? "Ajoute un visionnage au journal." : "Passe l'œuvre en terminée et la compte dans ton journal."}
          </span>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </section>
  );
}
