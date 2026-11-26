"use client";

import { useState, useSyncExternalStore } from "react";
import { dateLabel, starsLabel } from "@/lib/labels";
import type { SeasonReviewLine } from "@/lib/season-reviews";
import { htmlToPlain, RichText } from "../RichText";
import { useAction } from "../useAction";
import { LineForm } from "./LineForm";

const today = () => new Date().toISOString().slice(0, 10);

/** « Saison 2 », ou son nom TMDB quand il n'est pas juste « Saison 2 ». */
export function seasonTitle(season: number, name?: string | null): string {
  const plain = `Saison ${season}`;
  return name && name !== plain ? `${plain} · ${name}` : plain;
}

/** « Notée le 26 nov. », « Notée · ajoutée le 26 nov. » (sans date). */
function whenLabel(r: SeasonReviewLine): string {
  const verb = r.rating !== null ? "Notée" : "Critiquée";
  return r.undated ? `${verb} · ajoutée le ${dateLabel(r.at)}` : `${verb} le ${dateLabel(r.at)}`;
}

/** Une note / critique de saison, modifiable et supprimable. `prefix` : « Saison 2 » dans le journal. */
export function SeasonReviewItem({ review, prefix }: { review: SeasonReviewLine; prefix?: string }) {
  const { run, busy, error } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{whenLabel(review)}</span>
        {prefix && <span className="text-sky-300">{prefix}</span>}
        {review.rating !== null && <span className="text-amber-300">★ {starsLabel(review.rating)}</span>}
        {!editing && (
          <span className="ml-auto flex gap-3 text-xs">
            <button type="button" onClick={() => setEditing(true)} className="text-sky-300 hover:underline">
              Modifier
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (confirm("Supprimer cette critique de saison ?")) run("del", `/api/saisons/${review.id}`, null, "DELETE");
              }}
              className="text-white/50 hover:text-rose-300"
            >
              {busy === "del" ? "…" : "Supprimer"}
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <LineForm
          initial={{ date: review.undated ? "" : review.at.slice(0, 10), rating: review.rating, review: review.review ? htmlToPlain(review.review) : "", tags: [] }}
          submitLabel="Enregistrer"
          knownTags={[]}
          withTags={false}
          busy={busy === "edit"}
          onSubmit={async (v) => {
            if (await run("edit", `/api/saisons/${review.id}`, { date: v.date, rating: v.rating, review: v.review }, "PATCH")) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        review.review && <RichText text={review.review} className="text-white/80" />
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

/** Formulaire « Noter la saison » : date du jour (modifiable ou sans date), étoiles, critique. */
function SeasonReviewForm({ entryId, season, onDone }: { entryId: number; season: number; onDone: () => void }) {
  const { run, busy, error } = useAction();
  return (
    <div className="space-y-1">
      <LineForm
        initial={{ date: today(), rating: null, review: "", tags: [] }}
        submitLabel="Enregistrer"
        knownTags={[]}
        withTags={false}
        busy={busy === "add"}
        onSubmit={async (v) => {
          if (await run("add", `/api/library/${entryId}/saisons`, { season, date: v.date, rating: v.rating, review: v.review })) onDone();
        }}
        onCancel={onDone}
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

/** Dans la liste des saisons : tes notes / critiques de la saison et le bouton pour en ajouter une. */
export function SeasonReviewsBlock({ entryId, season, reviews }: { entryId: number; season: number; reviews: SeasonReviewLine[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3 py-3">
      {reviews.map((r) => (
        <SeasonReviewItem key={r.id} review={r} />
      ))}
      {adding ? (
        <SeasonReviewForm entryId={entryId} season={season} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
          ★ {reviews.length > 0 ? "Noter à nouveau la saison" : "Noter la saison"}
        </button>
      )}
    </div>
  );
}

const noSubscribe = () => () => undefined;

const dismissKey = (entryId: number, season: number, logId: number) => `omnilog:invite-saison:${entryId}:${season}:${logId}`;

/**
 * Invitation après le dernier épisode d'une saison : « Saison 2 terminée, tu la notes ? ».
 * « Plus tard » la masque pour ce visionnage (mémorisé dans le navigateur, sans écriture en base).
 */
export function SeasonReviewPrompt({ entryId, season, seasonName, logId }: { entryId: number; season: number; seasonName: string | null; logId: number }) {
  const key = dismissKey(entryId, season, logId);
  // Lu dans le navigateur seulement ; côté serveur l'invitation reste masquée (pas de différence au chargement).
  const dismissedBefore = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false; // Stockage indisponible (navigation privée…) : l'invitation reste affichée.
      }
    },
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  const [open, setOpen] = useState(false);

  if (dismissedBefore || dismissedNow) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Sans stockage, elle reviendra au prochain chargement : sans gravité.
    }
    setDismissedNow(true);
  };

  return (
    <div className="space-y-2 rounded-lg bg-amber-400/10 px-4 py-3 text-sm ring-1 ring-amber-300/20">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-amber-100">{seasonTitle(season, seasonName)} terminée, tu la notes ?</span>
        {!open && (
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-white px-3 py-1.5 font-medium text-black hover:bg-white/90">
              ★ Noter
            </button>
            <button type="button" onClick={dismiss} className="rounded-lg px-3 py-1.5 text-white/60 hover:text-white">
              Plus tard
            </button>
          </span>
        )}
      </div>
      {open && <SeasonReviewForm entryId={entryId} season={season} onDone={() => setOpen(false)} />}
    </div>
  );
}
