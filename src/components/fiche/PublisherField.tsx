"use client";

import { useState } from "react";

/** Éditeur français d'un manga : aucune source ne le fournit, on le saisit à la main. */
export function PublisherField({ mediaId, initial }: { mediaId: number; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [editing, setEditing] = useState(false);

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publisherFr: value.trim() || null }),
      });
      if (!res.ok) throw new Error();
      setSaved(value.trim());
      setValue(value.trim());
      setEditing(false);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {saved || <span className="text-white/40">Non renseigné</span>}
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-sky-300 hover:underline">
          {saved ? "Modifier" : "Renseigner"}
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Glénat, Kana, Pika…"
        autoFocus
        maxLength={200}
        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm outline-none focus:border-white/40"
      />
      <button type="button" onClick={save} disabled={status === "saving"} className="text-xs text-sky-300 hover:underline">
        {status === "saving" ? "…" : "Enregistrer"}
      </button>
      <button type="button" onClick={() => { setValue(saved); setEditing(false); }} className="text-xs text-white/50 hover:text-white">
        Annuler
      </button>
      {status === "error" && <span className="text-xs text-rose-400">Échec</span>}
    </span>
  );
}
