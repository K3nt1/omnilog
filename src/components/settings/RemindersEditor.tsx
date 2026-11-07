"use client";

import Link from "next/link";
import { useState } from "react";
import { ficheHref } from "@/lib/labels";
import { DAY_LABELS, daysLabel } from "@/lib/local-time";
import type { Reminder } from "@/lib/reminders";
import type { MediaType } from "@/lib/types";
import { useAction } from "../useAction";

const field = "rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-white/40";
const small = "rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-50";

/** Choix des jours : sept cases (lun → dim). */
export function DaysPicker({ value, onChange }: { value: number; onChange: (mask: number) => void }) {
  return (
    <div className="grid w-full max-w-sm grid-cols-7 gap-1" role="group" aria-label="Jours">
      {DAY_LABELS.map(([bit, label]) => {
        const on = (value & bit) !== 0;
        return (
          <button
            key={bit}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && value !== bit ? value & ~bit : value | bit)}
            className={`min-w-0 rounded-md py-1 text-xs ${on ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const { run, busy, error } = useAction();
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(reminder.timeOfDay);
  const [days, setDays] = useState(reminder.daysOfWeek);
  const [label, setLabel] = useState(reminder.label ?? "");
  const [sent, setSent] = useState<string | null>(null);
  const url = `/api/reminders/${reminder.id}`;
  const title =
    reminder.kind === "daily_quest"
      ? "🎯 Quête du jour"
      : reminder.kind === "custom"
        ? `⏰ ${reminder.label}`
        : `⏰ ${reminder.label?.trim() || reminder.work?.title || "Rappel"}`;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`font-medium ${reminder.isActive ? "" : "text-white/40 line-through"}`}>{title}</span>
        {reminder.kind === "media" && reminder.work && (
          <Link href={ficheHref(reminder.work.type as MediaType, reminder.work.externalId)} className="text-xs text-sky-300 hover:underline">
            {reminder.work.title}
          </Link>
        )}
        <span className="text-white/60">
          {daysLabel(reminder.daysOfWeek)} à {reminder.timeOfDay}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" disabled={busy !== null} onClick={() => run("active", url, { isActive: !reminder.isActive }, "PATCH")} className={small}>
            {reminder.isActive ? "Désactiver" : "Activer"}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className={small}>
            {editing ? "Fermer" : "Modifier"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setSent(null);
              if (await run("send", `${url}/send`, {})) setSent("Envoyé : la notification arrive.");
            }}
            className={small}
            title="Envoyer ce rappel maintenant, pour essayer"
          >
            {busy === "send" ? "…" : "Essayer"}
          </button>
          {reminder.kind !== "daily_quest" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => confirm("Supprimer ce rappel ?") && run("delete", url, null, "DELETE")}
              className={`${small} hover:text-rose-300`}
            >
              Supprimer
            </button>
          )}
        </span>
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {reminder.kind !== "daily_quest" && (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={reminder.kind === "media" ? "Nom (facultatif)" : "Nom du rappel"}
              maxLength={120}
              className={`${field} w-56`}
            />
          )}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} aria-label="Heure" />
          <DaysPicker value={days} onChange={setDays} />
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              const body: Record<string, unknown> = { timeOfDay: time, daysOfWeek: days };
              if (reminder.kind !== "daily_quest") body.label = label.trim() || (reminder.kind === "custom" ? reminder.label : null);
              if (await run("save", url, body, "PATCH")) setEditing(false);
            }}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
          >
            {busy === "save" ? "…" : "Enregistrer"}
          </button>
        </div>
      )}
      {sent && <p className="text-xs text-emerald-300">{sent}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </li>
  );
}

/** Quête du jour, rappels sur une œuvre et rappels libres : liste, modification, ajout d'un rappel libre. */
export function RemindersEditor({ reminders }: { reminders: Reminder[] }) {
  const { run, busy, error } = useAction();
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("10:00");
  const [days, setDays] = useState(127);

  return (
    <div className="space-y-4 text-sm">
      <ul className="divide-y divide-white/10">
        {reminders.map((r) => (
          <ReminderRow key={`${r.id}-${r.timeOfDay}-${r.daysOfWeek}-${r.isActive}-${r.label}`} reminder={r} />
        ))}
      </ul>
      <p className="text-xs text-white/50">Un rappel sur une œuvre se crée depuis sa fiche (« ⏰ Rappel »).</p>
      <form
        className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("add", "/api/reminders", { kind: "custom", label, timeOfDay: time, daysOfWeek: days })) setLabel("");
        }}
      >
        <span className="font-medium">Nouveau rappel</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bonus de connexion Dokkan" maxLength={120} required className={`${field} w-60`} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={field} aria-label="Heure" />
        <DaysPicker value={days} onChange={setDays} />
        <button type="submit" disabled={busy !== null || !label.trim()} className="rounded-lg bg-white px-3 py-1.5 font-medium text-black hover:bg-white/90 disabled:opacity-50">
          {busy === "add" ? "…" : "Ajouter"}
        </button>
      </form>
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}
