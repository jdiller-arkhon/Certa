'use client';

import { useEffect } from 'react';
import { BASE_PATH } from './base-path';

/** Registers the service worker in production builds only (dev servers change assets constantly). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
  }, []);
  return null;
}
