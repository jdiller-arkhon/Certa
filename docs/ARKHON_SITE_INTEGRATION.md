# Serving Certa inside the Arkhon website (`/certa`)

Certa runs as its own service (the Docker Compose stack in `infra/docker`). The Arkhon website
(Next.js on Cloudflare) forwards everything under `/certa` to it, so visitors stay on
`arkhonindustries.com` the whole time.

```
Browser ── https://arkhonindustries.com/certa/... ──► Cloudflare ──► Arkhon site (Next.js)
                                                                        │ rewrite /certa/*
                                                                        ▼
                                                     Certa origin (Caddy → web + API)
```

Verified end to end with a stand-in Next.js site using exactly the rewrite below: sign-up,
password sign-in, magic links (redirect + cookie through the proxy), rule-pack admin, audit log,
PWA install manifest, service worker, and offline reload.

## 1. Deploy the Certa origin

On the host that will serve Certa (any Docker host the Arkhon site can reach):

```bash
infra/scripts/init-env.sh
# then edit .env:
BASE_PATH=/certa
PUBLIC_URL=https://arkhonindustries.com/certa     # the public URL, not the origin's own hostname
CERTA_SITE_ADDRESS=certa-origin.arkhonindustries.com   # the origin's own hostname (Caddy gets a cert)
HTTP_PORT=443                                      # and publish 80/443 on the caddy service
CLIENT_IP_HEADER=cf-connecting-ip                  # see "Rate limiting" below
SMTP_URL=smtp://…                                  # real mail relay

docker compose -f infra/docker/compose.yml --env-file .env up -d --build
```

`BASE_PATH` is compiled into the web app, so rebuild (`--build`) after changing it.

## 2. Add one rewrite to the Arkhon website

In the Arkhon site's `next.config` (merge with any existing `rewrites`):

```js
async rewrites() {
  return {
    beforeFiles: [
      { source: '/certa', destination: 'https://certa-origin.arkhonindustries.com/certa' },
      { source: '/certa/:path*', destination: 'https://certa-origin.arkhonindustries.com/certa/:path*' },
    ],
  };
}
```

Also check the site's own configuration:

- **Middleware:** exclude `/certa` from the site's `middleware.ts` matcher (auth, i18n, redirects must not touch Certa requests).
- **Headers:** if the site sets headers for `/:path*` (e.g. its CSP), make sure they don't break Certa. Certa needs `'self'` for scripts, styles, connections, and its service worker (`worker-src 'self'`).
- **Caching:** don't let Cloudflare cache `/certa/api/*`. HTML under `/certa` should not be cached at the edge either (it's per-user after sign-in).
- **No other app may use `/certa`** or register a service worker whose scope covers `/certa/`.

Alternative: a Cloudflare Worker or Origin Rule routing `arkhonindustries.com/certa*` straight to
the Certa origin. Same result, and it removes the hop through the Next.js server.

## 3. Lock down the origin

The origin should accept traffic **only** from the Arkhon site/Cloudflare (firewall allowlist,
Cloudflare Tunnel, or mTLS). Then:

- **Rate limiting:** every request reaches Certa from the proxy, so per-IP limits would treat
  all users as one. With `CLIENT_IP_HEADER=cf-connecting-ip` Certa limits per real visitor. Only
  set this when the origin is locked down, otherwise the header can be spoofed.
- Nobody can bypass the site's edge protections by calling the origin directly.

## Security: what sharing an origin means

Hosting at a path (rather than a subdomain like `certa.arkhonindustries.com`) puts Certa and the
marketing site in **the same browser origin**. Certa's cookies are `HttpOnly`, `certa.`-prefixed,
and scoped to `Path=/certa`, so they are never sent to the rest of the site. But the browser
treats both as one trust boundary:

1. **Any script that runs on any arkhonindustries.com page can act as a signed-in Certa user**
   (it can call `/certa/api/...` and the browser attaches the cookie). It cannot read the cookie,
   but it can use it. Today that includes inline scripts and Stripe.js on the main site.
2. **Offline data (Phase 2) is per-origin.** Flights the field app stores in IndexedDB for
   offline use can be read by scripts on any arkhonindustries.com page. Encryption can't fix this,
   because same-origin scripts can use the same keys.

Mitigations, in order of strength:

- Keep third-party and inline scripts on the main site to a minimum; move its CSP from
  `Content-Security-Policy-Report-Only` to enforced.
- Treat a vulnerability anywhere on arkhonindustries.com as a Certa vulnerability in reviews and
  pen tests.
- If enterprise or public-sector customers need stronger isolation, serve Certa from
  `certa.arkhonindustries.com` (or use the self-hosted tier). That needs **no code change**: set
  `BASE_PATH=` and `PUBLIC_URL=https://certa.arkhonindustries.com`, and link to it from the site.

## Installed app (PWA) notes

- Install: open `arkhonindustries.com/certa/` on a phone → Share → *Add to Home Screen* (iOS) or
  the install prompt (Android/Chrome). The app opens standalone, scoped to `/certa/`.
- **iOS limits:** Safari may clear an installed web app's offline storage if it isn't opened for
  several weeks, and there is no background sync, so queued flights sync the next time the app is
  opened with signal. The app will show unsynced changes prominently (Phase 2). Android/Chrome
  storage is persistent once the app requests it.
- Icons in `apps/web/public/icons` are placeholders for the frontend to replace.
