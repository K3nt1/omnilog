"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { InstallPromptEvent } from "../AppSetup";

type State =
  | "loading"
  | "unsupported" // navigateur sans notifications web
  | "ios-install" // iPhone / iPad : il faut d'abord ajouter l'app à l'écran d'accueil
  | "denied" // refusées dans les réglages du navigateur
  | "off"
  | "on";

const button = "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50";
const secondary = "rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50";

/** Clé VAPID (base64url) → octets, format attendu par pushManager.subscribe. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** App installée (ouverte depuis l'écran d'accueil) : lu dans le navigateur, faux côté serveur. */
function useInstalled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(display-mode: standalone)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    isStandalone,
    () => false,
  );
}

/** Invitation à installer disponible (Android / ordinateur ; jamais sur iPhone). */
function useInstallable(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("omnilog:installable", onChange);
      window.addEventListener("appinstalled", onChange);
      return () => {
        window.removeEventListener("omnilog:installable", onChange);
        window.removeEventListener("appinstalled", onChange);
      };
    },
    () => !!window.__omnilogInstall,
    () => false,
  );
}

/** Installer l'app et activer les notifications sur cet appareil. */
export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const installed = useInstalled();
  const installable = useInstallable();

  useEffect(() => {
    // État de cet appareil, lu une fois au chargement (après une attente : aucun changement d'état synchrone ici).
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const reg = await (supported ? navigator.serviceWorker.ready : Promise.resolve(null));
      if (!reg) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      // La demande d'autorisation doit suivre un geste de l'utilisateur (obligatoire sur iPhone).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const keyRes = await fetch("/api/push/key");
      const key = (await keyRes.json()) as { publicKey?: string; error?: string };
      if (!key.publicKey) throw new Error(key.error ?? "Clé de notification indisponible.");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!res.ok) throw new Error("Enregistrement de l'appareil impossible.");
      setState("on");
      setMessage({ ok: true, text: "Notifications activées sur cet appareil." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Activation impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { devices?: number; error?: string };
    setMessage(
      res.ok
        ? { ok: true, text: `Envoyée à ${json.devices} appareil${(json.devices ?? 0) > 1 ? "s" : ""} : elle arrive dans quelques secondes.` }
        : { ok: false, text: json.error ?? "Envoi impossible." },
    );
    setBusy(false);
  }

  async function install() {
    const prompt = window.__omnilogInstall as InstallPromptEvent | null | undefined;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.__omnilogInstall = null;
    window.dispatchEvent(new Event("omnilog:installable"));
    if (choice.outcome === "dismissed") return;
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Installation */}
      {!installed && installable && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={install} className={button}>
            📲 Installer l&apos;app
          </button>
          <span className="text-white/60">Omnilog sur ton écran d&apos;accueil, en plein écran.</span>
        </div>
      )}
      {installed && <p className="text-white/60">✓ Tu utilises l&apos;app installée.</p>}

      {state === "loading" && <p className="text-white/50">Vérification…</p>}
      {state === "unsupported" && <p className="text-white/60">Ce navigateur ne gère pas les notifications web.</p>}
      {state === "ios-install" && (
        <div className="rounded-lg bg-sky-500/10 p-3 text-sky-100">
          <p className="font-medium">Sur iPhone et iPad, les notifications demandent d&apos;installer l&apos;app (iOS 16.4 ou plus) :</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>ouvre Omnilog dans <strong>Safari</strong> ;</li>
            <li>
              touche <strong>Partager</strong> (le carré avec une flèche), puis <strong>Sur l&apos;écran d&apos;accueil</strong> ;
            </li>
            <li>ouvre Omnilog depuis son icône, reviens dans Réglages et active les notifications.</li>
          </ol>
        </div>
      )}
      {state === "denied" && (
        <p className="text-amber-300">
          Les notifications sont bloquées pour Omnilog dans ce navigateur. Autorise-les dans ses réglages (icône à gauche de
          l&apos;adresse, ou Réglages → Notifications sur téléphone), puis recharge la page.
        </p>
      )}
      {state === "off" && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={enable} disabled={busy} className={button}>
            {busy ? "…" : "🔔 Activer les notifications sur cet appareil"}
          </button>
          <span className="text-white/60">À faire sur chaque appareil (téléphone, ordinateur).</span>
        </div>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-emerald-300">✓ Notifications activées sur cet appareil</span>
          <button type="button" onClick={test} disabled={busy} className={secondary}>
            {busy ? "…" : "Envoyer une notification de test"}
          </button>
          <button type="button" onClick={disable} disabled={busy} className="text-xs text-white/50 hover:text-rose-300">
            Désactiver ici
          </button>
        </div>
      )}
      {message && <p className={message.ok ? "text-emerald-300" : "text-rose-400"}>{message.text}</p>}
    </div>
  );
}
