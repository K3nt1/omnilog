"use client";

import { useEffect, useState } from "react";
import {
  DEVICES,
  EMULATORS,
  isComputer,
  LAUNCHERS,
  ownershipLabel,
  subscriptionsFor,
  SUBSCRIPTIONS,
  type Ownership,
} from "@/lib/ownership-shared";

const chip = "rounded-full px-3 py-1 text-sm ring-1 transition";
const toggle = (on: boolean) => `${chip} ${on ? "bg-sky-500/25 text-sky-50 ring-sky-400/50" : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10"}`;
const field = "rounded-lg border border-white/15 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/40";

const owns = (list: Ownership[], platform: string) => list.some((o) => o.platform === platform && o.format !== "emulated");

/**
 * « Où je l'ai » : les plateformes de sortie à toucher (physique / démat, abonnement ; sur PC, les launchers),
 * une plateforme où le jeu n'est pas sorti, ou un émulateur (console émulée, appareil, émulateur).
 * Chaque changement est enregistré aussitôt.
 */
export function OwnershipPanel({ entryId, releasePlatforms, initial }: { entryId: number; releasePlatforms: string[]; initial: Ownership[] }) {
  const [list, setList] = useState<Ownership[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [state, setState] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const [known, setKnown] = useState<string[]>([]);
  const [adding, setAdding] = useState<"platform" | "emulator" | null>(null);

  // Plateformes de la bibliothèque (mêmes noms que les filtres), pour « Autre plateforme » et la console émulée.
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    fetch("/api/manuel/plateformes")
      .then((res) => res.json() as Promise<{ platforms?: string[] }>)
      .then((json) => {
        if (!cancelled) setKnown(json.platforms ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [adding]);

  async function save(next: Ownership[]) {
    const previous = list;
    setList(next);
    setState({ saving: true, error: null });
    try {
      const res = await fetch(`/api/library/${entryId}/possession`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownership: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Enregistrement impossible.");
      setState({ saving: false, error: null });
    } catch (e) {
      setList(previous);
      setState({ saving: false, error: e instanceof Error ? e.message : "Enregistrement impossible." });
    }
  }

  const platforms = [
    ...releasePlatforms,
    ...list.filter((o) => o.format !== "emulated" && !releasePlatforms.includes(o.platform)).map((o) => o.platform),
    ...extra,
  ].filter((p, i, all) => all.indexOf(p) === i);
  const emulated = list.filter((o) => o.format === "emulated");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-white/60">Touche une plateforme pour dire comment tu as le jeu.</p>
        <ul className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <li key={p}>
              <button type="button" aria-expanded={open === p} onClick={() => setOpen(open === p ? null : p)} className={toggle(owns(list, p))}>
                {owns(list, p) ? "✓ " : ""}
                {p}
                {!releasePlatforms.includes(p) && <span className="text-white/40"> · hors sortie</span>}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setAdding(adding === "platform" ? null : "platform")} className={`${chip} text-white/60 ring-white/10 hover:text-white`}>
              + Autre plateforme
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setAdding(adding === "emulator" ? null : "emulator")} className={`${chip} text-white/60 ring-white/10 hover:text-white`}>
              + Émulateur
            </button>
          </li>
        </ul>
      </div>

      {adding === "platform" && (
        <OtherPlatform
          known={known.filter((p) => !platforms.includes(p))}
          onAdd={(p) => {
            setExtra((x) => [...x, p]);
            setOpen(p);
            setAdding(null);
          }}
        />
      )}
      {adding === "emulator" && (
        <EmulatorForm
          known={known}
          onAdd={(o) => {
            setAdding(null);
            void save([...list, o]);
          }}
        />
      )}

      {open && (
        <PlatformEditor
          platform={open}
          list={list.filter((o) => o.platform === open && o.format !== "emulated")}
          onChange={(rows) => void save([...list.filter((o) => o.platform !== open || o.format === "emulated"), ...rows])}
        />
      )}

      {list.filter((o) => o.format !== "emulated").length > 0 && (
        <p className="text-sm text-white/70">
          <span className="text-white/50">Possédé : </span>
          {list
            .filter((o) => o.format !== "emulated")
            .map(ownershipLabel)
            .join(" — ")}
        </p>
      )}
      {emulated.length > 0 && (
        <ul className="space-y-1 text-sm">
          {emulated.map((o) => (
            <li key={`${o.platform}-${o.device}`} className="flex flex-wrap items-center gap-2">
              <span>🕹 {ownershipLabel(o)}</span>
              <button
                type="button"
                onClick={() => void save(list.filter((x) => x !== o))}
                className="text-xs text-white/50 hover:text-rose-300"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.saving && <p className="text-xs text-white/50">Enregistrement…</p>}
      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}
    </div>
  );
}

/** Une plateforme : physique / démat (+ abonnement) ; sur ordinateur, les launchers (+ abonnement) et la boîte. */
function PlatformEditor({ platform, list, onChange }: { platform: string; list: Ownership[]; onChange: (rows: Ownership[]) => void }) {
  const computer = isComputer(platform);
  const base = { platform, store: null, subscription: null, device: null, emulator: null };
  const physical = list.find((o) => o.format === "physical");
  const digitals = list.filter((o) => o.format === "digital");
  const setPhysical = (on: boolean) => onChange(on ? [...list, { ...base, format: "physical" }] : list.filter((o) => o.format !== "physical"));
  const setDigital = (store: string | null, on: boolean) =>
    onChange(
      on
        ? [...list, { ...base, format: "digital", store }]
        : list.filter((o) => !(o.format === "digital" && (o.store ?? null) === store)),
    );
  const setSubscription = (store: string | null, subscription: string | null) =>
    onChange(list.map((o) => (o.format === "digital" && (o.store ?? null) === store ? { ...o, subscription } : o)));

  return (
    <div className="space-y-3 rounded-lg bg-black/20 p-3">
      <p className="text-sm font-medium">{platform}</p>
      {computer ? (
        <>
          <ul className="flex flex-wrap gap-2" aria-label={`Launchers ${platform}`}>
            {Object.entries(LAUNCHERS).map(([key, label]) => {
              const on = digitals.some((o) => o.store === key);
              return (
                <li key={key}>
                  <button type="button" aria-pressed={on} onClick={() => setDigital(key, !on)} className={toggle(on)}>
                    {label}
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" aria-pressed={Boolean(physical)} onClick={() => setPhysical(!physical)} className={toggle(Boolean(physical))}>
                Boîte
              </button>
            </li>
          </ul>
          {digitals
            .filter((o) => subscriptionsFor(platform, o.store).length > 0)
            .map((o) => (
              <SubscriptionChoice
                key={o.store}
                label={LAUNCHERS[o.store ?? ""] ?? ""}
                options={subscriptionsFor(platform, o.store)}
                value={o.subscription}
                onChange={(s) => setSubscription(o.store, s)}
              />
            ))}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={Boolean(physical)} onClick={() => setPhysical(!physical)} className={toggle(Boolean(physical))}>
              Physique
            </button>
            <button
              type="button"
              aria-pressed={digitals.length > 0}
              onClick={() => setDigital(null, digitals.length === 0)}
              className={toggle(digitals.length > 0)}
            >
              Dématérialisé
            </button>
          </div>
          {digitals.length > 0 && subscriptionsFor(platform, null).length > 0 && (
            <SubscriptionChoice
              label="Démat"
              options={subscriptionsFor(platform, null)}
              value={digitals[0].subscription}
              onChange={(s) => setSubscription(null, s)}
            />
          )}
        </>
      )}
      {list.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="text-xs text-white/50 hover:text-rose-300">
          Je ne l&apos;ai plus sur {platform}
        </button>
      )}
    </div>
  );
}

function SubscriptionChoice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-white/60">{label} :</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={field}>
        <option value="">Acheté (ou offert)</option>
        {options.map((s) => (
          <option key={s} value={s}>
            Via {SUBSCRIPTIONS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

function OtherPlatform({ known, onAdd }: { known: string[]; onAdd: (platform: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onAdd(value.trim().slice(0, 60));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        list="omnilog-plateformes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Plateforme (PS5, Switch…)"
        aria-label="Autre plateforme"
        className={field}
      />
      <datalist id="omnilog-plateformes">
        {known.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <button type="submit" disabled={!value.trim()} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50">
        Ajouter
      </button>
    </form>
  );
}

function EmulatorForm({ known, onAdd }: { known: string[]; onAdd: (o: Ownership) => void }) {
  const [platform, setPlatform] = useState("");
  const [device, setDevice] = useState("");
  const [emulator, setEmulator] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!platform.trim()) return;
        onAdd({
          platform: platform.trim().slice(0, 60),
          format: "emulated",
          store: null,
          subscription: null,
          device: device.trim().slice(0, 40) || null,
          emulator: emulator.trim().slice(0, 60) || null,
        });
      }}
      className="grid gap-2 rounded-lg bg-black/20 p-3 sm:grid-cols-4"
    >
      <input list="omnilog-consoles" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Console émulée (PS1…)" aria-label="Console émulée" required className={field} />
      <datalist id="omnilog-consoles">
        {known.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input list="omnilog-appareils" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Appareil (Steam Deck…)" aria-label="Appareil" className={field} />
      <datalist id="omnilog-appareils">
        {DEVICES.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <input list="omnilog-emulateurs" value={emulator} onChange={(e) => setEmulator(e.target.value)} placeholder="Émulateur (DuckStation…)" aria-label="Émulateur" className={field} />
      <datalist id="omnilog-emulateurs">
        {EMULATORS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <button type="submit" disabled={!platform.trim()} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50">
        Ajouter l&apos;émulateur
      </button>
    </form>
  );
}
