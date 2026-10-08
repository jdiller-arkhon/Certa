/**
 * Path prefix the app is served under. Hosted on the Arkhon website: '/certa'. Self-hosted at a
 * domain root: ''. Fixed at build time (Next.js basePath) and must match the API's PUBLIC_URL path.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/** Prefix for raw URLs (fetch, <a href>, service worker). Next's router and <Link> add it themselves. */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
