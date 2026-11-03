"use client";

import Link from "next/link";
import { ficheHref } from "@/lib/labels";
import type { Reminder } from "@/lib/reminders";
import type { MediaType } from "@/lib/types";
import { useAction } from "./useAction";

/** Rappels du jour à cocher : « ✓ Fait » ou « Passer » (un nouveau clic annule). */
export function TodayReminders({ reminders, date }: { reminders: Reminder[]; date: string }) {
  const { run, busy, error } = useAction();
  if (reminders.length === 0) {
    return (
      <p className="text-sm text-white/50">
        Aucun rappel aujourd&apos;hui. Ajoute-en dans les{" "}
        <Link href="/reglages" className="underline">
          Réglages
        </Link>{" "}
        ou depuis la fiche d&apos;une œuvre.
      </p>
    );
  }
  const mark = (r: Reminder, status: "done" | "skipped") =>
    run(`${r.id}-${status}`, `/api/reminders/${r.id}/today`, { date, status: r.todayStatus === status ? null : status });
  return (
    <ul className="divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10">
      {reminders.map((r) => (
        <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${r.todayStatus ? "opacity-60" : ""}`}>
          <span className="w-12 font-mono text-white/60">{r.timeOfDay}</span>
          <div className="min-w-0 flex-1">
            <p className={`font-medium ${r.todayStatus === "done" ? "line-through" : ""}`}>
              {r.kind === "custom" ? r.label : r.label?.trim() || r.work?.title}
            </p>
            {r.kind === "media" && r.work && (
              <Link href={ficheHref(r.work.type as MediaType, r.work.externalId)} className="text-xs text-sky-300 hover:underline">
                {r.work.title}
              </Link>
            )}
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => mark(r, "done")}
            className={`rounded-lg px-3 py-1.5 text-xs disabled:opacity-50 ${r.todayStatus === "done" ? "bg-emerald-500 text-black" : "bg-white/10 hover:bg-white/20"}`}
          >
            ✓ Fait
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => mark(r, "skipped")}
            className={`rounded-lg px-3 py-1.5 text-xs disabled:opacity-50 ${r.todayStatus === "skipped" ? "bg-white/40 text-black" : "bg-white/10 hover:bg-white/20"}`}
          >
            Passer
          </button>
        </li>
      ))}
      {error && <li className="px-4 py-2 text-sm text-rose-400">{error}</li>}
    </ul>
  );
}
