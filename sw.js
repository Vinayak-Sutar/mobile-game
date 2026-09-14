// Retiring worker. Version 2 used to live at the site root with a service
// worker here; it moved to v2/ (with its own worker and cache), and the root
// is now a redirect to Version 4. Phones that still have the old root worker
// fetch this file on their next visit: it clears the old cache, unregisters
// itself, and reloads any page it controlled so the redirect takes over.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('ashfall-main-') || k === 'ashfall-v1')
      .map((k) => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    for (const page of pages) page.navigate(page.url).catch(() => {});
  })());
});
