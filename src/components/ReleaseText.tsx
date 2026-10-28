"use client";

import { releaseBadge, releaseText, type ReleaseInfo } from "@/lib/release-shared";

/**
 * Prochaine sortie, à l'heure et au jour du navigateur (« Ép. 8 · demain à 16:00 »).
 * Le serveur (en UTC) et le navigateur peuvent écrire un texte différent : c'est voulu, d'où suppressHydrationWarning.
 */
export function ReleaseText({ release, short = false, className }: { release: ReleaseInfo; short?: boolean; className?: string }) {
  return (
    <span className={className} suppressHydrationWarning>
      {short ? releaseBadge(release) : releaseText(release)}
    </span>
  );
}
