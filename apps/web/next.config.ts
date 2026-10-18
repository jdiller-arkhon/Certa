import type { NextConfig } from 'next';

/**
 * Behind Caddy (Docker Compose), /api/* reaches the API on the same origin, so no rewrite.
 * Without Caddy (local dev, e2e), set API_ORIGIN and /api/* is proxied there. Rewrites are
 * fixed at build time, so the Docker image is built without API_ORIGIN.
 */
const apiOrigin = process.env.API_ORIGIN ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : null);

/** '/certa' when hosted inside the Arkhon website; '' for a self-hosted install at a domain root. */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/**
 * Everything is same-origin except the Draco decoder three.js fetches from Google's CDN for
 * compressed 3D models. Inline scripts are allowed because Next.js and the install-prompt
 * capture use them; the rest of the policy still blocks framing, plugins, foreign scripts and
 * connections to other hosts.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://www.gstatic.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const config: NextConfig = {
  basePath,
  output: 'standalone',
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  transpilePackages: ['@certa/ui', '@certa/contract'],
  poweredByHeader: false,
  async headers() {
    // The service worker must be revalidated on every load so updates roll out promptly.
    const sw = { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: `${basePath}/` }] };
    // Dev needs eval for fast refresh; production gets the policy.
    if (process.env.NODE_ENV !== 'production') return [sw];
    return [sw, { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: CSP }] }];
  },
  async rewrites() {
    // `source` is automatically prefixed with basePath; the API serves under the same prefix.
    return apiOrigin ? [{ source: '/api/:path*', destination: `${apiOrigin}${basePath}/api/:path*` }] : [];
  },
};

export default config;
