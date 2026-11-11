// Envoi des paquets d'import à /api/import depuis le navigateur, avec nouveaux essais.
import type { ImportItemResult, ImportResponse, LetterboxdFilm, LocgSeries, MalImportItem } from "./types";

export type ImportSourceName = "mal" | "letterboxd" | "locg";
type ImportItem = MalImportItem | LetterboxdFilm | LocgSeries;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    // Page HTML au lieu de JSON : erreur Cloudflare (limite de calcul, 5xx) ou session Access expirée.
  }
  if (json === null && (res.url.includes("/cdn-cgi/access") || text.includes("cloudflareaccess.com"))) {
    throw Object.assign(new Error("Session Cloudflare Access expirée : recharge la page puis réessaie."), { status: 401 });
  }
  if (!res.ok || json === null) {
    const cloudflareCode = text.match(/Error (1\d{3})/)?.[1];
    const message =
      json?.error ??
      `Réponse inattendue du serveur (HTTP ${res.status}${cloudflareCode ? `, erreur Cloudflare ${cloudflareCode}` : ""})`;
    throw Object.assign(new Error(message), { status: res.ok ? 502 : res.status });
  }
  return json;
}

/** Délais avant chaque nouvel essai : laisse le temps à une erreur passagère de Cloudflare de se dissiper. */
const RETRY_DELAYS_MS = [3000, 10000];

export async function postBatch(source: ImportSourceName, items: ImportItem[]): Promise<ImportItemResult[]> {
  let lastError = "Erreur réseau";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return (await postJson<ImportResponse>("/api/import", { source, items })).results;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erreur réseau";
      const status = (e as { status?: number }).status;
      if (status !== undefined && status < 500) break; // format refusé ou session expirée : inutile d'insister
    }
  }
  // Le paquet entier échoue : on retente œuvre par œuvre, pour ne perdre que celle qui pose problème.
  if (items.length > 1 && !lastError.startsWith("Session")) {
    const results: ImportItemResult[] = [];
    for (const item of items) results.push(...(await postBatch(source, [item])));
    return results;
  }
  return items.map((item) => ({
    key: item.key,
    label: "label" in item ? item.label : "name" in item ? item.name : item.title,
    status: "error" as const,
    message: lastError,
  }));
}
