"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Événement envoyé après chaque action réussie. */
export const PROGRESS_EVENT = "omnilog:action";

/** Envoie une action (JSON) puis recharge la page côté serveur ; garde l'état « en cours » et l'erreur. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run(id: string, url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<boolean> {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action impossible.");
      // Prévient les composants qui gardent leurs propres données (liste des épisodes d'une saison…).
      window.dispatchEvent(new Event(PROGRESS_EVENT));
      startTransition(() => router.refresh());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { run, busy, error };
}
