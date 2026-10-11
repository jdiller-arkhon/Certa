/*
 * Certa service worker: makes the installed app open and navigate with no signal.
 * It caches the app shell, build assets, and visited pages (HTML and their RSC payloads, so
 * in-app navigation between visited screens works offline). Records live in IndexedDB and new
 * flights in the outbox (src/lib/outbox.ts); see docs/ARCHITECTURE_PLAN.md §8.
 *
 * Scope is the registration scope (e.g. /certa/), so nothing outside Certa is ever touched.
 * API responses are never cached here: authenticated data lives in IndexedDB, not the HTTP cache.
 */
const VERSION = 'certa-shell-v2';
const SCOPE = new URL(self.registration.scope).pathname; // '/certa/' or '/'
const API = `${SCOPE}api/`;
const STATIC = `${SCOPE}_next/static/`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll([SCOPE, `${SCOPE}sign-in`])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('certa-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE) || url.pathname.startsWith(API)) return;

  // Immutable build assets: cache first.
  if (url.pathname.startsWith(STATIC)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // In-app navigation payloads (React Server Components): network first, cached per route.
  // The `_rsc` query is a cache-buster that changes per build, so the key drops it.
  if (req.headers.get('RSC') === '1') {
    const key = new URL(url);
    key.searchParams.delete('_rsc');
    key.searchParams.set('__certa_rsc', '1');
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(key.href, res.clone()));
          return res;
        })
        .catch(() => caches.match(key.href).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Pages: network first, fall back to the last cached copy (or the app root) when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE))),
    );
  }
});
