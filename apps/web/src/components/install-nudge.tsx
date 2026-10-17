'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useInstall } from '@/lib/install';
import { Banner } from './ui/feedback';

const KEY = 'certa.installNudge.dismissed';

/** On a phone browser tab (not the installed app), a one-line, dismissible pointer to /install. */
export function InstallNudge() {
  const { platform, installed } = useInstall();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);
  const phone = platform === 'iphone' || platform === 'ipad' || platform === 'android';
  if (!phone || installed || dismissed) return null;
  return (
    <Banner
      onDismiss={() => {
        setDismissed(true);
        try {
          localStorage.setItem(KEY, '1');
        } catch {
          // Private mode: it just shows again next time.
        }
      }}
    >
      Add Certa to your Home Screen to log flights with no signal.{' '}
      <Link href="/install" className="font-semibold underline underline-offset-4">
        Show me how
      </Link>
    </Banner>
  );
}
