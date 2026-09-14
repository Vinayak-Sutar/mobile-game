// Offline cache for the installed PWA.
//
// Bump CACHE when shipping: the old cache is dropped on activate, so players
// are never stuck on a stale build.
//
// Version 2 lives in v2/ (it was the site root until Version 4 became the
// default). Every version has its own worker and its own cache prefix, and
// each worker only deletes caches with its own prefix, so versions can't wipe
// each other's offline copy. (The old root cache, 'ashfall-main-*', is cleared
// by the retiring root sw.js.)
const PREFIX = 'ashfall-v2-';
const CACHE = `${PREFIX}2`;
const LEGACY = ['ashfall-v1'];   // this worker's cache name before versions split

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
