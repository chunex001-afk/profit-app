// v2: HTML is now network-first so a stale cache can never permanently mask
// a new deployment (previously cache-first served index.html forever).
// Bumping CACHE_NAME + deleting old-named caches on activate also lets a
// browser that still has the old "rikaku-app-v1" worker installed self-heal
// as soon as it picks up this file (browsers periodically re-check an
// active registration's script in the background even without a fresh
// register() call from the page).
const CACHE_NAME = 'rikaku-app-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(APP_SHELL.map(url =>
        fetch(url, { cache: 'reload' })
          .then(res => { if (res.ok) return cache.put(url, res); })
          .catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => {
        try { client.navigate(client.url); } catch (e) {}
      }))
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate'
    || req.destination === 'document'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/');

  if (isHTML) {
    // Never trust the cache for HTML: always try the network first, and
    // only fall back to whatever is cached if the network is unreachable.
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Non-HTML assets keep cache-first-with-background-refresh so offline use
  // still works, without risking stale HTML.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
