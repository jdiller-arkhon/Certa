'use client';

import { useEffect, useState } from 'react';

/**
 * Installing Certa as an app. Chrome, Edge, Samsung Internet and other Chromium browsers (on
 * Android, Windows, macOS, ChromeOS, Linux) offer a one-click install through the
 * `beforeinstallprompt` event; Safari (iPhone, iPad, Mac) and Firefox don't, so those get
 * step-by-step instructions instead.
 *
 * The event fires once, early in the page load, so an inline script in the root layout
 * (INSTALL_CAPTURE_SCRIPT in ./install-capture) holds on to it before React hydrates.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __certaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type Platform = 'iphone' | 'ipad' | 'android' | 'mac-safari' | 'desktop-chromium' | 'desktop-firefox' | 'desktop-other';

export function detectPlatform(ua: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ipad';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'desktop-firefox';
  if (/Edg\/|Chrome\/|Chromium\/|CriOS|OPR\//.test(ua)) return 'desktop-chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'mac-safari';
  return 'desktop-other';
}

/** True when Certa is already running as an installed app (Home Screen, dock, or app window). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstall() {
  const [state, setState] = useState<{ platform: Platform | null; canPrompt: boolean; installed: boolean }>({ platform: null, canPrompt: false, installed: false });
  useEffect(() => {
    const sync = () =>
      setState({
        platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
        canPrompt: !!window.__certaInstallPrompt,
        installed: isStandalone(),
      });
    sync();
    const onInstalled = () => setState((s) => ({ ...s, canPrompt: false, installed: true }));
    window.addEventListener('certa:installable', sync);
    window.addEventListener('certa:installed', onInstalled);
    return () => {
      window.removeEventListener('certa:installable', sync);
      window.removeEventListener('certa:installed', onInstalled);
    };
  }, []);
  /** Shows the browser's install dialog. Resolves true if the person installed. */
  const prompt = async () => {
    const e = window.__certaInstallPrompt;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    // The event can only be used once.
    window.__certaInstallPrompt = null;
    setState((s) => ({ ...s, canPrompt: false, installed: outcome === 'accepted' || s.installed }));
    return outcome === 'accepted';
  };
  return { ...state, prompt };
}
