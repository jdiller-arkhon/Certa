/*
 * Certa service worker: makes the installed app open and navigate with no signal.
 * It caches the app shell, build assets, and visited pages (HTML and their RSC payloads, so
 * in-app navigation between visited screens works offline). Records live in IndexedDB and new
 * flights in the outbox (src/lib/outbox.ts); see docs/ARCHITECTURE_PLAN.md §8.
 *
 * Scope is the registration scope (e.g. /certa/), so nothing outside Certa is ever touched.
 * API responses are never cached here: authenticated data lives in IndexedDB, not the HTTP cache.
 */
const VERSION = 'certa-shell-v5';
const SCOPE = new URL(self.registration.scope).pathname; // '/certa/' or '/'
const API = `${SCOPE}api/`;
const STATIC = `${SCOPE}_next/static/`;
// Secret-link pages (inspector packets) are never stored on the viewer's device.
const SHARE = `${SCOPE}share/`;

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
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE) || url.pathname.startsWith(API) || url.pathname.startsWith(SHARE)) return;

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

// ---------------------------------------------------------------- push notifications

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  // Only app-relative paths, so a payload can never send the user off-site.
  let path = '/';
  if (typeof data.url === 'string' && data.url.startsWith('/') && !data.url.includes('\\')) {
    const u = new URL(`${SCOPE}${data.url.slice(1)}`, self.location.origin);
    if (u.origin === self.location.origin && u.pathname.startsWith(SCOPE)) path = `/${u.pathname.slice(SCOPE.length)}${u.search}`;
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'Certa'), {
      body: String(data.body || ''),
      tag: data.tag ? String(data.tag) : undefined,
      icon: `${SCOPE}icons/icon-192.png`,
      badge: `${SCOPE}icons/favicon-32.png`,
      data: { url: `${SCOPE}${path.slice(1)}` },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || SCOPE, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin + SCOPE) && 'focus' in c) return c.focus().then(() => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
