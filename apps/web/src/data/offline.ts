'use client';

import { CertaApiError } from '@certa/sdk';
import { idb } from '@/lib/idb';

/**
 * Network-first fetch with an IndexedDB fallback: a successful response is cached; when the
 * network is unreachable the last cached copy is served instead, so the installed app opens
 * in the field. Server answers (4xx/5xx) are never masked by the cache.
 */
export async function networkFirst<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    void idb.set('cache', cacheKey, { at: new Date().toISOString(), value: fresh });
    return fresh;
  } catch (err) {
    if (err instanceof CertaApiError) throw err;
    const cached = await idb.get<{ at: string; value: T }>('cache', cacheKey);
    if (cached) return cached.value;
    throw err;
  }
}

/** Drop every cached response (sign-out, or another user on a shared device). */
export const clearOfflineCache = () => idb.clear('cache');
