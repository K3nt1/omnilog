"use client";

const today = () => new Date().toISOString().slice(0, 10);

/** Corps de requête pour une date choisie : « » = sans date. */
export const datedBody = (date: string) => (date ? { date } : { undated: true });

/**
 * Date d'un visionnage / d'une lecture / d'une session : aujourd'hui par défaut, modifiable,
 * ou « Sans date » (ni le journal ni le calendrier ne la placent sur un jour). Valeur « » = sans date.
 */
export function DateInput({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  if (!value) {
    return (
      <span className={`inline-flex items-center gap-2 text-xs ${className}`}>
        <span className="rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-white/70">Sans date</span>
        <button type="button" onClick={() => onChange(today())} className="text-sky-300 hover:underline">
          Choisir une date
        </button>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <input
        type="date"
        value={value}
        max={today()}
        onChange={(e) => onChange(e.target.value || today())}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/40"
        aria-label="Date"
      />
      <button type="button" onClick={() => onChange("")} className="text-xs text-white/50 hover:text-white">
        Sans date
      </button>
    </span>
  );
}
