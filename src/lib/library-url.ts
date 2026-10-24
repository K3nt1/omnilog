// Filtres de la bibliothèque <-> adresse de la page (?statut=…&tri=…), pour pouvoir mettre une vue en favori.
// Utilisable côté serveur comme côté navigateur (aucun accès à la base).
import { DEFAULT_DIRECTION, RATING_FILTERS, SORT_KEYS, sortsFor, type LibraryQuery, type RatingFilter, type SortKey } from "./browse-shared";
import { STATUS_SLUGS, statusFromSlug, TYPE_SLUGS, typeFromSlug } from "./labels";
import type { MediaType } from "./types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lit les filtres depuis l'adresse. `fixedType` = type imposé par la page (/films/liste). */
export function parseLibraryQuery(params: RawSearchParams, fixedType: MediaType | null = null): LibraryQuery {
  const type = fixedType ?? typeFromSlug(first(params.type));
  const sortParam = first(params.tri);
  const allowed = sortsFor(type);
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortParam ?? "") && allowed.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : "activite";
  const order = first(params.ordre);
  const rating = first(params.note);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    type,
    status: statusFromSlug(first(params.statut)),
    favorite: first(params.favoris) === "1",
    rating: (RATING_FILTERS as readonly string[]).includes(rating ?? "") ? (rating as RatingFilter) : null,
    genre: first(params.genre)?.slice(0, 60) || null,
    search: (first(params.q) ?? "").slice(0, 100),
    sort,
    direction: order === "asc" || order === "desc" ? order : DEFAULT_DIRECTION[sort],
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * Adresse correspondant à des filtres. Les valeurs par défaut ne sont pas écrites,
 * et tout changement de filtre ramène à la page 1 (sauf si `page` est donné).
 */
export function libraryHref(basePath: string, q: LibraryQuery, change: Partial<LibraryQuery> = {}, fixedType = false): string {
  const next: LibraryQuery = { ...q, page: 1, ...change };
  if (change.sort && !change.direction) next.direction = DEFAULT_DIRECTION[change.sort];
  const params = new URLSearchParams();
  if (next.type && !fixedType) params.set("type", TYPE_SLUGS[next.type]);
  if (next.status) params.set("statut", STATUS_SLUGS[next.status]);
  if (next.favorite) params.set("favoris", "1");
  if (next.rating) params.set("note", next.rating);
  if (next.genre) params.set("genre", next.genre);
  if (next.search.trim()) params.set("q", next.search.trim());
  if (next.sort !== "activite") params.set("tri", next.sort);
  if (next.direction !== DEFAULT_DIRECTION[next.sort]) params.set("ordre", next.direction);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
