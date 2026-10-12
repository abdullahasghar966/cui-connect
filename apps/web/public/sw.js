/*
 * CUI Connect service worker: shows push notifications, and opens the right page when one is
 * tapped. It caches nothing, so the app always loads fresh from the server.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CUI Connect', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only pages of this site are opened.
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin);
  const path = url.origin === self.location.origin ? url.pathname + url.search : '/notifications';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // The app moves to the page itself (no reload), then comes to the front.
        open.postMessage({ type: 'open', path });
        return open.focus();
      }
      return self.clients.openWindow(path);
    })(),
  );
});
