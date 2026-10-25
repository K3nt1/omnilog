import type { FocusOverview } from "@/lib/browse";
import { MEDIA_TYPES, type MediaType } from "@/lib/types";
import { FocusSlot } from "./FocusSlot";

/** Bandeau « En ce moment » : un focus par type (ou le tirage au sort quand il n'y en a pas). */
export function FocusBanner({ overview, type = null }: { overview: FocusOverview; type?: MediaType | null }) {
  if (type) {
    return (
      <section aria-label="En ce moment">
        <FocusSlot type={type} card={overview.cards[type] ?? null} plannedCount={overview.plannedCounts[type]} large />
      </section>
    );
  }
  return (
    <section aria-label="En ce moment">
      <h2 className="mb-3 text-xl font-semibold">En ce moment</h2>
      <div className="scroll-row -mx-4 -mt-1 grid auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pt-1 pb-3 xl:grid-flow-row xl:grid-cols-5">
        {MEDIA_TYPES.map((t) => (
          <FocusSlot key={t} type={t} card={overview.cards[t] ?? null} plannedCount={overview.plannedCounts[t]} />
        ))}
      </div>
    </section>
  );
}
