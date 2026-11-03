"use client";

import { useState, useSyncExternalStore } from "react";
import type { Settings } from "@/lib/settings";
import { useAction } from "../useAction";

const field = "rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-white/40";

/** Fuseaux proposés en premier ; les autres se tapent (liste du navigateur). */
const COMMON_ZONES = ["Europe/Paris", "Asia/Nicosia", "Europe/Brussels", "Europe/Zurich", "Europe/London", "America/Montreal", "Asia/Tokyo"];

const noSubscribe = () => () => undefined;
let zonesCache: string[] | null = null;
/** Tous les fuseaux connus du navigateur (même tableau à chaque appel, comme l'exige useSyncExternalStore). */
function zonesOfBrowser(): string[] {
  if (!zonesCache) {
    try {
      zonesCache = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? COMMON_ZONES;
    } catch {
      zonesCache = COMMON_ZONES;
    }
  }
  return zonesCache;
}

/** Fuseau horaire et pays pour « Où regarder ». */
export function GeneralSettings({ settings, regions }: { settings: Settings; regions: [string, string][] }) {
  const { run, busy, error } = useAction();
  const [zone, setZone] = useState(settings.timezone);
  // Fuseau et liste des fuseaux du navigateur (pas du serveur) : lus seulement côté navigateur.
  const browserZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => null);
  const allZones = useSyncExternalStore(noSubscribe, zonesOfBrowser, () => COMMON_ZONES);
  const save = (id: string, patch: Partial<Settings>) => run(id, "/api/settings", patch, "PATCH");

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="font-medium">Fuseau horaire</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.timezoneAuto}
            disabled={busy !== null}
            onChange={(e) => save("auto", { timezoneAuto: e.target.checked, ...(e.target.checked && browserZone ? { timezone: browserZone } : {}) })}
          />
          Automatique : celui de l&apos;appareil{browserZone ? ` (${browserZone})` : ""}
        </label>
        {!settings.timezoneAuto && (
          <div className="flex flex-wrap items-center gap-2">
            <input list="zones" value={zone} onChange={(e) => setZone(e.target.value)} className={`${field} w-64`} aria-label="Fuseau horaire" />
            <datalist id="zones">
              {[...COMMON_ZONES, ...allZones.filter((z) => !COMMON_ZONES.includes(z))].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <button type="button" disabled={busy !== null || zone === settings.timezone} onClick={() => save("zone", { timezone: zone })} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20 disabled:opacity-50">
              {busy === "zone" ? "…" : "Enregistrer"}
            </button>
          </div>
        )}
        <p className="text-xs text-white/50">
          Actuel : <strong className="text-white/80">{settings.timezone}</strong>. Les rappels partent à l&apos;heure de ce fuseau.
        </p>
      </div>

      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Pays pour « Où regarder »</span>
        <select
          value={settings.watchRegion}
          disabled={busy !== null}
          onChange={(e) => save("region", { watchRegion: e.target.value })}
          className={field}
        >
          {regions.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}
