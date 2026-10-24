import Link from "next/link";

/** Numéros à afficher : 1 … 4 5 [6] 7 8 … 28 */
function pageNumbers(page: number, count: number): (number | "…")[] {
  const pages = new Set([1, count, page - 2, page - 1, page, page + 1, page + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && p - last > 1) out.push("…");
    out.push(p);
  }
  return out;
}

/** Pagination numérotée ; `hrefFor` construit l'adresse d'une page en gardant les filtres. */
export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const item = "min-w-9 rounded-lg px-3 py-1.5 text-center text-sm";
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={`${item} bg-white/10 hover:bg-white/20`}>
          ← Précédente
        </Link>
      )}
      {pageNumbers(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-white/40">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${item} ${p === page ? "bg-white text-black" : "bg-white/5 hover:bg-white/15"}`}
          >
            {p}
          </Link>
        ),
      )}
      {page < pageCount && (
        <Link href={hrefFor(page + 1)} className={`${item} bg-white/10 hover:bg-white/20`}>
          Suivante →
        </Link>
      )}
    </nav>
  );
}
