/** Erreur d'une source externe, avec un message lisible pour l'interface. */
export class SourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

const TIMEOUT_MS = 8000;

/** fetch + délai maximum + JSON + erreur claire si la source répond mal. */
export async function fetchJson<T>(source: string, url: string | URL, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "délai dépassé" : "injoignable";
    throw new SourceError(source, `${source} : ${reason}`);
  }
  if (!response.ok) {
    throw new SourceError(source, `${source} : erreur ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}
