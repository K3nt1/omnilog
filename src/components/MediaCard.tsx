import Link from "next/link";
import type { LibraryCard } from "@/lib/browse-shared";
import { clockLabel, starsLabel, statusLabel, TYPE_SINGULAR } from "@/lib/labels";
import { yearOf } from "@/lib/types";

/** Progression affichée sur l'affiche, seulement pour une œuvre commencée et pas terminée. */
function progressOf(card: LibraryCard): { label: string; ratio: number | null } | null {
  if (card.status !== "in_progress" && card.status !== "on_hold" && card.status !== "dropped") return null;
  if (card.type === "tv" && card.currentEpisode !== null) {
    const s = String(card.currentSeason ?? 1).padStart(2, "0");
    const e = String(card.currentEpisode).padStart(2, "0");
    return { label: `S${s}E${e}`, ratio: null };
  }
  if (card.type === "anime" && card.currentEpisode !== null) {
    const total = card.totalEpisodes;
    return {
      label: total ? `Ép. ${card.currentEpisode} / ${total}` : `Ép. ${card.currentEpisode}`,
      ratio: total ? Math.min(1, (card.currentEpisode - 1) / total) : null,
    };
  }
  if (card.type === "manga" && card.currentChapter !== null) {
    const chapter = card.currentChapter.toLocaleString("fr-FR");
    const total = card.totalChapters;
    return {
      label: total ? `Ch. ${chapter} / ${total}` : `Ch. ${chapter}`,
      ratio: total ? Math.min(1, (card.currentChapter - 1) / total) : null,
    };
  }
  return null;
}

function pauseOf(card: LibraryCard): string | null {
  if (card.pauseSeconds !== null) return `⏸ ${clockLabel(card.pauseSeconds)}`;
  if (card.pausePage !== null) return `⏸ p. ${card.pausePage}`;
  return null;
}

const STATUS_STYLE: Record<LibraryCard["status"], string> = {
  planned: "bg-sky-500/80",
  in_progress: "bg-emerald-500/80",
  on_hold: "bg-amber-500/80",
  completed: "bg-neutral-700/90",
  dropped: "bg-rose-600/80",
};

/**
 * Vignette d'une œuvre : affiche (perso sinon officielle), badges, progression, pause.
 * `showType` affiche la pastille du type (utile quand la grille mélange films, séries…).
 */
export function MediaCard({
  card,
  showType = false,
  detail = null,
}: {
  card: LibraryCard;
  showType?: boolean;
  /** Ligne d'info sous le titre (date d'ajout, nombre de visionnages… selon le tri). */
  detail?: string | null;
}) {
  const year = yearOf(card.releaseDate);
  const stars = starsLabel(card.rating);
  const progress = progressOf(card);
  const pause = pauseOf(card);

  return (
    <Link href={`/oeuvre/${card.mediaId}`} className="group flex flex-col" title={card.title}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:ring-white/40">
        {card.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-white/50">{card.title}</div>
        )}

        {/* Haut : type, focus, favori */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5 text-[11px] sm:text-xs">
          <div className="flex flex-wrap gap-1">
            {showType && <span className="rounded bg-black/70 px-1.5 py-0.5">{TYPE_SINGULAR[card.type]}</span>}
            {card.isFocus && <span className="rounded bg-black/70 px-1.5 py-0.5" title="En ce moment">🎯</span>}
            {card.isOngoing && <span className="rounded bg-violet-600/80 px-1.5 py-0.5">En diffusion</span>}
          </div>
          {card.isFavorite && (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-rose-400" title="Favori">
              ♥
            </span>
          )}
        </div>

        {/* Bas : statut, note, progression, pause */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 pt-6 text-[11px] sm:text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[card.status]}`}>{statusLabel(card.status, card.type)}</span>
            {stars && <span className="rounded bg-black/70 px-1.5 py-0.5 text-amber-300">★ {stars}</span>}
            {pause && <span className="rounded bg-black/70 px-1.5 py-0.5">{pause}</span>}
          </div>
          {progress && (
            <div className="mt-1">
              <span className="font-medium">{progress.label}</span>
              {progress.ratio !== null && (
                <div className="mt-0.5 h-1 overflow-hidden rounded bg-white/20">
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-tight">{card.title}</p>
      <p className="line-clamp-1 text-xs text-white/50">{[year, card.originalTitle].filter(Boolean).join(" · ")}</p>
      {detail && <p className="mt-0.5 line-clamp-1 text-xs font-medium text-sky-300">{detail}</p>}
    </Link>
  );
}
