// Notifications web (Web Push) envoyées depuis le Worker, sans service tiers.
// Les notifications partent « vides » : l'appareil réveillé vient chercher le texte à afficher
// (push_messages, via /api/push/pending). Seule la signature VAPID (JWT ES256) est nécessaire :
// pas de chiffrement du contenu à gérer. Fonctionne sur Android, ordinateur et iPhone (iOS 16.4+,
// app ajoutée à l'écran d'accueil).
import { CURRENT_USER_ID } from "./library";

export interface PushEnv {
  DB: D1Database;
  /** Clé publique VAPID : point P-256 non compressé (65 octets) en base64url. */
  VAPID_PUBLIC_KEY?: string;
  /** Clé privée VAPID : scalaire « d » (32 octets) en base64url. */
  VAPID_PRIVATE_KEY?: string;
}

/** Contact VAPID demandé par les services de notification : l'adresse du site (pas d'e-mail). */
const VAPID_SUBJECT = "https://omnilog.kantinus.workers.dev";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const textB64url = (s: string) => b64url(new TextEncoder().encode(s));

export const pushConfigured = (env: PushEnv) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** JWT VAPID signé (ES256) pour le service de notification de `endpoint` (FCM, Mozilla, Apple…). */
export async function vapidJwt(env: Required<Pick<PushEnv, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY">>, endpoint: string, now = Date.now()): Promise<string> {
  const pub = fromB64url(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = textB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = textB64url(
    JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: VAPID_SUBJECT }),
  );
  // WebCrypto signe au format r||s (64 octets), celui qu'attend un JWT ES256.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Enregistre un message à afficher (titre, texte, page ouverte au toucher). */
export async function queueMessage(db: D1Database, message: { title: string; body: string; url?: string; tag?: string }): Promise<void> {
  await db
    .prepare("INSERT INTO push_messages (user_id, title, body, url, tag) VALUES (?, ?, ?, ?, ?)")
    .bind(CURRENT_USER_ID, message.title.slice(0, 120), message.body.slice(0, 500), message.url ?? "/aujourdhui", message.tag ?? null)
    .run();
}

/**
 * Réveille tous les appareils abonnés (une notification vide chacun) ; ils viendront chercher les messages en attente.
 * Un abonnement que le service dit expiré (404 / 410) est supprimé. Renvoie le nombre d'appareils réveillés.
 */
export async function wakeDevices(env: PushEnv): Promise<number> {
  if (!pushConfigured(env)) return 0;
  const keys = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY! };
  const { results } = await env.DB.prepare("SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?")
    .bind(CURRENT_USER_ID)
    .all<{ id: number; endpoint: string }>();
  let sent = 0;
  const statements: D1PreparedStatement[] = [];
  for (const sub of results.slice(0, 20)) {
    try {
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          TTL: String(24 * 3600),
          Urgency: "normal",
          Authorization: `vapid t=${await vapidJwt(keys, sub.endpoint)}, k=${keys.VAPID_PUBLIC_KEY}`,
          "Content-Length": "0",
        },
      });
      if (res.status === 404 || res.status === 410) {
        statements.push(env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id));
      } else if (res.ok) {
        sent++;
        statements.push(
          env.DB.prepare("UPDATE push_subscriptions SET failures = 0, last_success_at = ? WHERE id = ?").bind(new Date().toISOString(), sub.id),
        );
      } else {
        console.error("Notification refusée", res.status, await res.text().catch(() => ""));
        statements.push(env.DB.prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").bind(sub.id));
      }
    } catch (error) {
      console.error("Service de notification injoignable", error);
    }
  }
  if (statements.length > 0) await env.DB.batch(statements);
  return sent;
}

/** Messages pas encore affichés par cet appareil (24 h au plus), puis marqués comme affichés. */
export async function pendingMessages(
  db: D1Database,
  endpoint: string | null,
): Promise<{ id: number; title: string; body: string; url: string; tag: string | null }[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const sub = endpoint
    ? await db.prepare("SELECT id, last_message_id FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).first<{ id: number; last_message_id: number }>()
    : null;
  const { results } = await db
    .prepare(
      `SELECT id, title, body, url, tag FROM push_messages
       WHERE user_id = ? AND id > ? AND created_at >= ? ORDER BY id DESC LIMIT 5`,
    )
    .bind(CURRENT_USER_ID, sub?.last_message_id ?? 0, since)
    .all<{ id: number; title: string; body: string; url: string; tag: string | null }>();
  if (sub && results.length > 0) {
    await db.prepare("UPDATE push_subscriptions SET last_message_id = ? WHERE id = ?").bind(results[0].id, sub.id).run();
  }
  // Appareil inconnu (abonnement perdu) : seulement le dernier message, pour ne pas tout réafficher.
  return (sub ? results : results.slice(0, 1)).reverse();
}

export async function saveSubscription(db: D1Database, endpoint: string, userAgent: string | null): Promise<void> {
  // Nouvel appareil : il ne doit pas réafficher les anciens messages.
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, user_agent, last_message_id)
       VALUES (?1, ?2, ?3, COALESCE((SELECT MAX(id) FROM push_messages WHERE user_id = ?1), 0))
       ON CONFLICT (endpoint) DO UPDATE SET user_agent = excluded.user_agent, failures = 0`,
    )
    .bind(CURRENT_USER_ID, endpoint, userAgent?.slice(0, 300) ?? null)
    .run();
}

export async function deleteSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(endpoint, CURRENT_USER_ID).run();
}
