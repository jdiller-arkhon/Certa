/*
 * Certa service worker: makes the installed app open and navigate with no signal.
 * Phase 1 caches the app shell only. Phase 2 adds the IndexedDB data store and the sync
 * outbox (docs/ARCHITECTURE_PLAN.md §8) so flights can be logged offline for days.
 *
 * Scope is the registration scope (e.g. /certa/), so nothing outside Certa is ever touched.
 * API responses are never cached here: authenticated data lives in IndexedDB, not the HTTP cache.
 */
const VERSION = 'certa-shell-v1';
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
