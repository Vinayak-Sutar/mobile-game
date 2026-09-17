// Offline cache for the installed PWA.
//
// Bump CACHE when shipping: the old cache is dropped on activate, so players
// are never stuck on a stale build.
//
// Versions 1-4 have their own workers and cache prefixes. Each worker
// only ever deletes caches with its own prefix, so the two versions can't
// wipe each other's offline copy.
const PREFIX = 'ashfall-v5-';
const CACHE = `${PREFIX}1`;
const LEGACY = [];

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './src/game.js',
];

self.addEventListener('install', (ev) => {
  // addAll fails the whole install if any entry 404s, so tolerate misses.
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE && (k.startsWith(PREFIX) || LEGACY.includes(k)))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  // Network-first: a dev refresh should always get fresh code, and the cache
  // is only there to keep the game playable offline.
  ev.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
