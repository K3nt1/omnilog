"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EMPTY_MANUAL, ManualForm } from "@/components/ManualForm";
import { ficheHref } from "@/lib/labels";
import { isMediaType, type MediaType } from "@/lib/types";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AddManually />
    </Suspense>
  );
}

/** « Ajouter à la main » : une œuvre absente de sa source (jeu retiré d'IGDB, film inconnu de TMDB…). */
function AddManually() {
  const params = useSearchParams();
  const router = useRouter();
  const typeParam = params.get("type");
  const type: MediaType = isMediaType(typeParam) ? typeParam : "movie";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/manuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { type?: MediaType; externalId?: string; error?: string };
      if (!res.ok || !json.type || !json.externalId) throw new Error(json.error ?? "Ajout impossible.");
      router.push(ficheHref(json.type, json.externalId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ajout impossible.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Ajouter à la main</h1>
        <p className="text-sm text-white/60">
          Pour une œuvre introuvable dans la recherche. Elle marche comme les autres (statut, progression, journal, notes,
          calendrier, bilan), mais ses infos ne sont jamais mises à jour automatiquement : tu pourras les modifier sur sa fiche.
        </p>
      </div>
      <ManualForm
        initialType={type}
        initial={{ ...EMPTY_MANUAL, title: params.get("titre") ?? "" }}
        withStatus
        submitLabel="Ajouter"
        busy={busy}
        error={error}
        onSubmit={create}
      />
    </main>
  );
}
