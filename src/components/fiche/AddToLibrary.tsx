"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { plannedLabel, statusLabel } from "@/lib/labels";
import type { LibraryStatus, MediaType } from "@/lib/types";

/** Œuvre absente de la bibliothèque : l'ajouter en watchlist, ou directement comme déjà vue / lue / jouée. */
export function AddToLibrary({ type, externalId }: { type: MediaType; externalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<LibraryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function add(status: LibraryStatus) {
    setBusy(status);
    setError(null);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, externalId, status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ajout impossible.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ajout impossible.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
      <p className="mb-3 text-sm text-white/70">Pas encore dans ta bibliothèque.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => add("planned")}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          {busy === "planned" ? "Ajout…" : `+ ${plannedLabel(type)}`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => add("completed")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
        >
          {busy === "completed" ? "Ajout…" : `✓ Déjà ${statusLabel("completed", type).toLowerCase()}`}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
