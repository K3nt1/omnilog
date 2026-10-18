// Lecture d'un fichier ZIP dans le navigateur, sans dépendance :
// lit le répertoire central du ZIP et décompresse chaque fichier avec
// DecompressionStream("deflate-raw"), intégré aux navigateurs récents.

const decoder = new TextDecoder("utf-8");

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Renvoie le contenu texte des fichiers du ZIP dont le chemin passe le filtre.
 * Gère les méthodes "stockée" (0) et "deflate" (8), celles des exports Letterboxd.
 */
export async function readZipTextFiles(
  buffer: ArrayBuffer,
  filter: (path: string) => boolean = () => true,
): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin du fichier.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Ce fichier n'est pas un ZIP valide.");

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files: Record<string, string> = {};

  for (let n = 0; n < entryCount; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Répertoire du ZIP illisible.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeader = view.getUint32(offset + 42, true);
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith("/") || !filter(path)) continue;

    // L'en-tête local a ses propres longueurs de nom et de champ "extra".
    const localNameLength = view.getUint16(localHeader + 26, true);
    const localExtraLength = view.getUint16(localHeader + 28, true);
    const start = localHeader + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) files[path] = decoder.decode(raw);
    else if (method === 8) files[path] = decoder.decode(await inflateRaw(raw));
    else throw new Error(`Méthode de compression non gérée (${method}) pour ${path}.`);
  }
  return files;
}
