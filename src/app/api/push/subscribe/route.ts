// POST /api/push/subscribe { endpoint } : abonne cet appareil ; DELETE { endpoint } : le désabonne.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { deleteSubscription, saveSubscription } from "@/lib/push";

async function readEndpoint(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    return typeof body.endpoint === "string" && /^https:\/\/\S+$/.test(body.endpoint) && body.endpoint.length < 1000 ? body.endpoint : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const endpoint = await readEndpoint(request);
  if (!endpoint) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  await saveSubscription(env.DB, endpoint, request.headers.get("user-agent"));
  return NextResponse.json({ subscribed: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const endpoint = await readEndpoint(request);
  if (!endpoint) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  const { env } = getCloudflareContext();
  await deleteSubscription(env.DB, endpoint);
  return NextResponse.json({ subscribed: false }, { headers: { "Cache-Control": "no-store" } });
}
