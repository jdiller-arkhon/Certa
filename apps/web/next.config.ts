import type { NextConfig } from 'next';

/**
 * Behind Caddy (Docker Compose), /api/* reaches the API on the same origin, so no rewrite.
 * Without Caddy (local dev, e2e), set API_ORIGIN and /api/* is proxied there. Rewrites are
 * fixed at build time, so the Docker image is built without API_ORIGIN.
 */
const apiOrigin = process.env.API_ORIGIN ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : null);

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  transpilePackages: ['@certa/ui', '@certa/contract'],
  poweredByHeader: false,
  async rewrites() {
    return apiOrigin ? [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] : [];
  },
};

export default config;
