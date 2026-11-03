// Génère une paire de clés VAPID pour les notifications (une seule fois, puis à garder en secret).
// Usage : node scripts/vapid-keys.mjs
// Puis :
//   - local : ajoute les deux lignes affichées dans .dev.vars (jamais commité) ;
//   - Cloudflare : npx wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (prod), et avec --env staging.
// Changer de clés désabonne tous les appareils : il faudra réactiver les notifications sur chacun.
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const jwk = await subtle.exportKey("jwk", pair.privateKey);
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
