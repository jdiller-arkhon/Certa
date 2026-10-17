import type { MetadataRoute } from 'next';
import { BASE_PATH } from '@/lib/base-path';

/** Installable app ("Add to Home Screen"): the field app is the web app, scoped to the base path. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE_PATH}/`,
    name: 'Certa — Flight Operations Logbook',
    short_name: 'Certa',
    description: 'Flight operations & compliance logbook by Arkhon Industries',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2b2b2e',
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${BASE_PATH}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the Home Screen icon (Android) or right-click the dock/taskbar icon (computers).
    shortcuts: [
      { name: 'Log a flight', short_name: 'Log flight', url: `${BASE_PATH}/flights/new`, icons: [{ src: `${BASE_PATH}/icons/icon-192.png`, sizes: '192x192' }] },
      { name: 'Missions', url: `${BASE_PATH}/missions`, icons: [{ src: `${BASE_PATH}/icons/icon-192.png`, sizes: '192x192' }] },
      { name: 'Flights', url: `${BASE_PATH}/flights`, icons: [{ src: `${BASE_PATH}/icons/icon-192.png`, sizes: '192x192' }] },
    ],
  };
}
