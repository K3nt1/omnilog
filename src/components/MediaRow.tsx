import Link from "next/link";
import type { LibraryCard } from "@/lib/browse-shared";
import { ficheHref, starsLabel, statusLabel, TYPE_SINGULAR } from "@/lib/labels";
import { yearOf } from "@/lib/types";
import { CardActions } from "./CardActions";
import { ReleaseText } from "./ReleaseText";
import { pauseOf, progressOf, STATUS_STYLE } from "./MediaCard";

/** Ligne de la vue liste : petite affiche, titre, statut, note, progression, info du tri. */
export function MediaRow({
  card,
  showType = false,
  detail = null,
  actions = true,
}: {
  card: LibraryCard;
  showType?: boolean;
  detail?: string | null;
  actions?: boolean;
}) {
  const href = ficheHref(card.type, card.externalId);
  const year = yearOf(card.releaseDate);
  const stars = starsLabel(card.rating);
  const progress = progressOf(card);
  const pause = pauseOf(card);
  return (
    <div className="group relative flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <Link href={href} className="h-16 w-11 shrink-0 overflow-hidden rounded bg-white/5 ring-1 ring-white/10">
        {card.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="line-clamp-1 text-sm font-medium hover:underline">
          {card.title}
          {year && <span className="ml-1.5 font-normal text-white/50">{year}</span>}
        </Link>
        <p className="line-clamp-1 text-xs text-white/50">
          {[showType ? TYPE_SINGULAR[card.type] : null, card.originalTitle].filter(Boolean).join(" · ")}
        </p>
        {detail && <p className="line-clamp-1 text-xs font-medium text-sky-300">{detail}</p>}
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 text-xs sm:flex">
        {progress && <span className="text-white/70">{progress.label}</span>}
        {pause && <span className="text-white/70">{pause}</span>}
        {card.release ? (
          <ReleaseText release={card.release} className="rounded bg-violet-600/80 px-1.5 py-0.5" />
        ) : (
          card.isOngoing && <span className="rounded bg-violet-600/80 px-1.5 py-0.5">En diffusion</span>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 text-xs sm:w-36">
        {card.isFocus && <span title="En ce moment">🎯</span>}
        {card.isFavorite && <span className="text-rose-400" title="Favori">♥</span>}
        {stars && <span className="text-amber-300">★ {stars}</span>}
        <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[card.status]}`}>{statusLabel(card.status, card.type)}</span>
      </div>
      {actions && (
        <div className="relative shrink-0">
          <CardActions card={card} popover />
        </div>
      )}
    </div>
  );
}
