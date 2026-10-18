// POST /api/library  { "type": "movie", "externalId": "438631", "status": "planned" }
// Récupère la fiche complète auprès de la source, puis l'ajoute à ta bibliothèque.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { addToLibrary } from "@/lib/library";
import { getDetails } from "@/lib/sources";
import { SourceError } from "@/lib/sources/http";
import { isLibraryStatus, isMediaType, SOURCE_FOR_TYPE } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const { type, externalId, status = "planned" } = (body ?? {}) as Record<string, unknown>;
  if (!isMediaType(type)) {
    return NextResponse.json({ error: "Type de média invalide." }, { status: 400 });
  }
  if (typeof externalId !== "string" || !/^\d{1,12}$/.test(externalId)) {
    return NextResponse.json({ error: "Identifiant externe invalide." }, { status: 400 });
  }
  if (!isLibraryStatus(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  try {
    const details = await getDetails(env, type, externalId);
    const result = await addToLibrary(env.DB, details, status);
    return NextResponse.json(
      { ...result, title: details.title, source: SOURCE_FOR_TYPE[type] },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("Ajout à la bibliothèque en échec", error);
    if (error instanceof SourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 404 ? 404 : 502 });
    }
    return NextResponse.json({ error: "Erreur inattendue pendant l'ajout." }, { status: 500 });
  }
}
