// Service worker d'Omnilog : reçoit les notifications et ouvre la bonne page quand on les touche.
// Les notifications arrivent « vides » : on demande au site ce qu'il faut afficher (/api/push/pending).
// iPhone : chaque notification reçue doit afficher quelque chose, d'où le message de secours.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let messages = [];
      try {
        const sub = await self.registration.pushManager.getSubscription();
        const query = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : "";
        const res = await fetch(`/api/push/pending${query}`, { cache: "no-store" });
        messages = (await res.json()).messages ?? [];
      } catch {
        messages = [];
      }
      if (messages.length === 0) messages = [{ title: "Omnilog", body: "Du nouveau sur Omnilog.", url: "/aujourdhui" }];
      await Promise.all(
        messages.map((m) =>
          self.registration.showNotification(m.title, {
            body: m.body,
            tag: m.tag ?? undefined,
            icon: "/icons/icon-192.png",
            badge: "/icons/badge-96.png",
            data: { url: m.url ?? "/aujourdhui" },
          }),
        ),
      );
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/aujourdhui", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
