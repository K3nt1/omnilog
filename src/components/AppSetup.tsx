"use client";

import { useEffect } from "react";

/** Événement d'installation (Android / ordinateur), gardé pour le bouton « Installer » des Réglages. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __omnilogInstall?: InstallPromptEvent | null;
  }
}

/**
 * Au chargement de chaque page : enregistre le service worker (notifications), garde l'invitation à installer
 * l'app, et envoie le fuseau du navigateur une fois par session (il n'est enregistré qu'en mode automatique).
 */
export function AppSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.error("Service worker non enregistré", e));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__omnilogInstall = e as InstallPromptEvent;
      window.dispatchEvent(new Event("omnilog:installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let sent: string | null = null;
    try {
      sent = sessionStorage.getItem("omnilog-tz");
    } catch {
      sent = null;
    }
    if (tz && sent !== tz) {
      fetch("/api/settings/timezone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone: tz }) })
        .then(() => {
          try {
            sessionStorage.setItem("omnilog-tz", tz);
          } catch {
            // navigation privée : on renverra à la prochaine page, sans conséquence
          }
        })
        .catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
