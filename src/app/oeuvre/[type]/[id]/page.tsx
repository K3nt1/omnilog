import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToLibrary } from "@/components/fiche/AddToLibrary";
import { PublisherField } from "@/components/fiche/PublisherField";
import { RichText } from "@/components/RichText";
import { TrackingPanel } from "@/components/fiche/TrackingPanel";
import { getLibraryStatuses, getStoredFiche, type JournalLine, type StoredMedia } from "@/lib/entry";
import { getFiche, type MediaFiche } from "@/lib/fiche";
import type { RelatedWork } from "@/lib/fiche/types";
import {
  dateLabel,
  durationLabel,
  episodeName,
  ficheHref,
  starsLabel,
  statusLabel,
  TYPE_LABELS,
  TYPE_SINGULAR,
  TYPE_SLUGS,
  typeFromSlug,
} from "@/lib/labels";
import { SourceError } from "@/lib/sources/http";
import { yearOf, type MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string; id: string }> };

const SOURCE_NAME: Record<MediaType, string> = { movie: "TMDB", tv: "TMDB", anime: "MyAnimeList", manga: "MyAnimeList", game: "IGDB" };

const REGION_NAMES: Record<string, string> = { CY: "Chypre", FR: "France", BE: "Belgique", CH: "Suisse", CA: "Canada" };

async function load(slug: string, id: string) {
  const type = typeFromSlug(slug);
  if (!type || !/^\d{1,12}$/.test(id)) return null;
  const { env } = getCloudflareContext();
  const stored = await getStoredFiche(env.DB, type, id);
  let fiche: MediaFiche | null = null;
  let sourceError: string | null = null;
  try {
    fiche = await getFiche(env, type, id, stored.watchRegion);
  } catch (error) {
    if (error instanceof SourceError && error.status === 404 && !stored.media) return null;
    sourceError = error instanceof SourceError ? error.message : `${SOURCE_NAME[type]} : erreur inattendue`;
    console.error("Fiche en échec", type, id, error);
  }
  if (!fiche && !stored.media) return { type, stored, fiche: null, sourceError, statuses: new Map() };
  const related = fiche?.related.flatMap((g) => g.works) ?? [];
  const statuses = related.length > 0 ? await getLibraryStatuses(env.DB, related) : new Map();
  return { type, stored, fiche, sourceError, statuses };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type: slug, id } = await params;
  const type = typeFromSlug(slug);
  if (!type || !/^\d{1,12}$/.test(id)) return { title: "Introuvable" };
  const { env } = getCloudflareContext();
  const { results } = await env.DB.prepare("SELECT title FROM media WHERE type = ? AND external_id = ?")
    .bind(type, id)
    .all<{ title: string }>();
  return { title: results[0]?.title ?? TYPE_SINGULAR[type] };
}

/** Fiche minimale à partir de la base quand la source ne répond pas. */
function ficheFromStore(type: MediaType, externalId: string, m: StoredMedia): MediaFiche {
  return {
    type,
    externalId,
    title: m.title,
    originalTitle: m.originalTitle,
    overview: m.overview,
    posterUrl: m.posterUrl,
    backdropUrl: m.backdropUrl,
    releaseDate: m.releaseDate,
    releaseLabel: "Sortie",
    runtimeMinutes: m.runtimeMinutes,
    totalEpisodes: m.totalEpisodes,
    totalChapters: m.totalChapters,
    totalVolumes: m.totalVolumes,
    state: null,
    isOngoing: m.isOngoing,
    genres: m.genres,
    credits: [],
    cast: [],
    seasons: [],
    platforms: [],
    timeToBeat: null,
    nextEpisode: null,
    providers: null,
    related: [],
    links: [],
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** « 2 h 15 », « 5 saisons · 48 épisodes · 45 min », « 120 chapitres · 12 tomes »… */
function durationLine(f: MediaFiche): string | null {
  const parts: string[] = [];
  if (f.type === "movie" && f.runtimeMinutes) parts.push(durationLabel(f.runtimeMinutes));
  if (f.type === "tv") {
    const seasons = f.seasons.filter((s) => s.seasonNumber > 0).length;
    if (seasons) parts.push(plural(seasons, "saison"));
  }
  if ((f.type === "tv" || f.type === "anime") && f.totalEpisodes) parts.push(plural(f.totalEpisodes, "épisode"));
  if ((f.type === "tv" || f.type === "anime") && f.runtimeMinutes) parts.push(`${f.runtimeMinutes} min par épisode`);
  if (f.type === "manga") {
    if (f.totalChapters) parts.push(plural(f.totalChapters, "chapitre"));
    if (f.totalVolumes) parts.push(plural(f.totalVolumes, "tome"));
  }
  if (f.type === "game" && f.timeToBeat?.normally) parts.push(`≈ ${durationLabel(f.timeToBeat.normally)} pour le finir`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function journalWhat(line: JournalLine, f: MediaFiche): string | null {
  if (line.kind === "episode") {
    const number = line.episode !== null ? (line.season !== null ? `S${pad(line.season)}E${pad(line.episode)}` : `Ép. ${line.episode}`) : null;
    const name = line.note ? episodeName(line.note, [f.title, f.originalTitle]) : null;
    return [number, name].filter(Boolean).join(" · ") || null;
  }
  if (line.kind === "chapter" && line.chapter !== null) return `Ch. ${line.chapter.toLocaleString("fr-FR")}`;
  if (line.kind === "session") return line.minutes ? `Session de ${durationLabel(line.minutes)}` : "Session";
  return null;
}

const VERB: Record<MediaType, string> = { movie: "Vu", tv: "Vu", anime: "Vu", manga: "Lu", game: "Joué" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RelatedCard({ work, status, currentType }: { work: RelatedWork; status: string | null; currentType: MediaType }) {
  return (
    <Link href={ficheHref(work.type, work.externalId)} className="group flex flex-col" title={work.title}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:ring-white/40">
        {work.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-white/50">{work.title}</div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5 text-[11px]">
          {work.relation && <span className="rounded bg-black/75 px-1.5 py-0.5">{work.relation}</span>}
        </div>
        {status && (
          <div className="absolute inset-x-0 bottom-0 p-1.5 text-[11px]">
            <span className="rounded bg-emerald-600/90 px-1.5 py-0.5">✓ {status}</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-tight">{work.title}</p>
      <p className="text-xs text-white/50">{[work.year, work.type !== currentType ? TYPE_SINGULAR[work.type] : null].filter(Boolean).join(" · ")}</p>
    </Link>
  );
}

/** Fiche d'une œuvre : infos en direct depuis la source, ton suivi, ton journal, les œuvres liées. */
export default async function FichePage({ params }: Props) {
  const { type: slug, id } = await params;
  const data = await load(slug, id);
  if (!data) notFound();
  const { type, stored, sourceError, statuses } = data;

  if (!data.fiche && !stored.media) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">Fiche indisponible</h1>
        <p className="text-white/60">{sourceError ?? "La source n'a pas répondu."} Réessaie dans un instant.</p>
      </main>
    );
  }

  const f = data.fiche ?? ficheFromStore(type, id, stored.media!);
  const entry = stored.entry;
  const poster = entry?.customPosterUrl ?? stored.media?.posterUrl ?? f.posterUrl;
  const backdrop = entry?.customBackdropUrl ?? f.backdropUrl ?? stored.media?.backdropUrl;
  const year = yearOf(f.releaseDate);
  const duration = durationLine(f);
  // Lien Letterboxd importé : plus précis que le lien construit à partir de l'identifiant TMDB.
  const links = f.links.map((l) =>
    l.label === "Letterboxd" && stored.media?.externalLinks.letterboxd ? { ...l, url: stored.media.externalLinks.letterboxd } : l,
  );
  const providers = f.providers;
  const hasOffers = providers && (providers.stream.length || providers.free.length || providers.rent.length || providers.buy.length);

  return (
    <main className="pb-16">
      {/* En-tête : image de fond, affiche, titre */}
      <div className="relative">
        {backdrop && (
          <div className="absolute inset-0 -z-10 h-80 overflow-hidden sm:h-96">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdrop} alt="" className="h-full w-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/30 via-neutral-950/70 to-neutral-950" />
          </div>
        )}
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 sm:flex-row sm:pt-16">
          <div className="w-36 shrink-0 self-center overflow-hidden rounded-xl bg-white/5 shadow-2xl ring-1 ring-white/15 sm:w-56 sm:self-start">
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt={`Affiche de ${f.title}`} className="aspect-[2/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center p-4 text-center text-white/50">{f.title}</div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-sm text-white/60">
                <Link href={`/${TYPE_SLUGS[type]}`} className="hover:text-white">
                  {TYPE_LABELS[type]}
                </Link>
                {entry?.isFocus && " · 🎯 En ce moment"}
              </p>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{f.title}</h1>
              {f.originalTitle && <p className="mt-1 text-lg text-white/60">{f.originalTitle}</p>}
              <p className="mt-2 text-sm text-white/70">
                {[year, duration, f.state].filter(Boolean).join(" · ")}
              </p>
            </div>

            {f.genres.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {f.genres.map((g) => (
                  <li key={g} className="rounded-full border border-white/15 px-3 py-0.5 text-xs text-white/80">
                    {g}
                  </li>
                ))}
              </ul>
            )}

            {entry ? <TrackingPanel key={`${entry.status}|${entry.rating}|${entry.isFavorite}|${entry.startedAt}|${entry.completedAt}`} entry={entry} type={type} /> : <AddToLibrary type={type} externalId={id} />}

            {links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.label}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl space-y-10 px-4">
        {sourceError && (
          <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            Infos complètes indisponibles pour l&apos;instant ({sourceError}) : seules les données enregistrées sont affichées.
          </p>
        )}

        {f.overview && (
          <Section title="Synopsis">
            <p className="max-w-3xl whitespace-pre-line leading-relaxed text-white/85">{f.overview}</p>
          </Section>
        )}

        {f.nextEpisode && (
          <p className="rounded-lg bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            <span className="font-medium">{type === "anime" ? "Diffusion : " : "Prochain épisode : "}</span>
            {f.nextEpisode.label}
            {f.nextEpisode.date && ` — le ${dateLabel(f.nextEpisode.date)}`}
          </p>
        )}

        {providers && (
          <Section title={`Où regarder${REGION_NAMES[providers.region] ? ` (${REGION_NAMES[providers.region]})` : ` (${providers.region})`}`}>
            {hasOffers ? (
              <div className="space-y-3">
                {(
                  [
                    ["Abonnement", providers.stream],
                    ["Gratuit", providers.free],
                    ["Location", providers.rent],
                    ["Achat", providers.buy],
                  ] as const
                ).map(([label, list]) =>
                  list.length > 0 ? (
                    <div key={label} className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-sm text-white/60">{label}</span>
                      {list.map((p) => (
                        <span key={p.name} className="flex items-center gap-2 rounded-lg bg-white/5 py-1 pl-1 pr-3 text-sm ring-1 ring-white/10">
                          {p.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.logoUrl} alt="" className="h-7 w-7 rounded" loading="lazy" />
                          )}
                          {p.name}
                        </span>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-sm text-white/60">Aucune offre légale connue dans ce pays pour l&apos;instant.</p>
            )}
            <p className="mt-3 text-xs text-white/40">
              Données{" "}
              <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" className="underline">
                JustWatch
              </a>
              {providers.link && (
                <>
                  {" · "}
                  <a href={providers.link} target="_blank" rel="noopener noreferrer" className="underline">
                    voir toutes les offres
                  </a>
                </>
              )}
            </p>
          </Section>
        )}

        {(f.credits.length > 0 || type === "manga" || f.platforms.length > 0 || f.releaseDate) && (
          <Section title="Infos">
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {f.releaseDate && (
                <div>
                  <dt className="text-white/50">{f.releaseLabel}</dt>
                  <dd>{dateLabel(f.releaseDate)}</dd>
                </div>
              )}
              {f.credits.map((c) => (
                <div key={c.role}>
                  <dt className="text-white/50">{c.role}</dt>
                  <dd>{c.names.join(", ")}</dd>
                </div>
              ))}
              {type === "manga" && stored.media && (
                <div>
                  <dt className="text-white/50">Éditeur français</dt>
                  <dd>
                    <PublisherField mediaId={stored.media.id} initial={stored.media.publisherFr} />
                  </dd>
                </div>
              )}
              {type === "manga" && !stored.media && (
                <div>
                  <dt className="text-white/50">Éditeur français</dt>
                  <dd className="text-white/40">Ajoute le manga à ta bibliothèque pour le renseigner</dd>
                </div>
              )}
              {f.platforms.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-white/50">Plateformes</dt>
                  <dd>{f.platforms.join(", ")}</dd>
                </div>
              )}
              {f.timeToBeat && (
                <div className="sm:col-span-2">
                  <dt className="text-white/50">Durée de vie (IGDB)</dt>
                  <dd>
                    {[
                      f.timeToBeat.hastily && `Rapide : ${durationLabel(f.timeToBeat.hastily)}`,
                      f.timeToBeat.normally && `Normal : ${durationLabel(f.timeToBeat.normally)}`,
                      f.timeToBeat.completely && `100 % : ${durationLabel(f.timeToBeat.completely)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
          </Section>
        )}

        {f.cast.length > 0 && (
          <Section title={type === "tv" ? "Distribution principale" : "Distribution"}>
            <ul className="scroll-row -mx-4 -mt-1 flex gap-3 overflow-x-auto px-4 pt-1 pb-3">
              {f.cast.map((p) => (
                <li key={`${p.name}-${p.detail}`} className="w-28 shrink-0 text-sm">
                  <div className="aspect-[2/3] overflow-hidden rounded-lg bg-white/5">
                    {p.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 font-medium leading-tight">{p.name}</p>
                  {p.detail && <p className="line-clamp-2 text-xs text-white/50">{p.detail}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {f.seasons.length > 0 && (
          <Section title="Saisons">
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {f.seasons.map((s) => (
                <li key={s.seasonNumber} className="flex justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <span>{s.name ?? (s.seasonNumber === 0 ? "Épisodes spéciaux" : `Saison ${s.seasonNumber}`)}</span>
                  <span className="text-white/60">
                    {[plural(s.episodeCount, "épisode"), yearOf(s.airDate)].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {stored.journal.length > 0 && (
          <Section title={`Mon journal (${stored.journal.length})`}>
            <ul className="divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10">
              {stored.journal.map((line) => {
                const what = journalWhat(line, f);
                return (
                  <li key={line.id} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium">
                        {line.kind === "session" ? "Le" : VERB[type]} le {dateLabel(line.at)}
                      </span>
                      {what && <span className="text-sky-300">{what}</span>}
                      {line.rating !== null && <span className="text-amber-300">★ {starsLabel(line.rating)}</span>}
                    </div>
                    {line.kind === "session" && line.note && <p className="text-white/70">Où j&apos;en suis : {line.note}</p>}
                    {line.review && <RichText text={line.review} className="text-white/80" />}
                    {line.tags.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {line.tags.map((t) => (
                          <li key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70">
                            #{t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {f.related.map((group) => (
          <Section key={group.title} title={group.title}>
            <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {group.works.map((w) => {
                const status = statuses.get(`${w.type}:${w.externalId}`);
                return (
                  <li key={`${w.type}-${w.externalId}`}>
                    <RelatedCard work={w} status={status ? statusLabel(status, w.type) : null} currentType={type} />
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

        <footer className="border-t border-white/10 pt-4 text-xs text-white/40">
          Données : {SOURCE_NAME[type]}
          {type === "movie" || type === "tv"
            ? ". Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB."
            : "."}
        </footer>
      </div>
    </main>
  );
}
