'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/base-path';
import { useInstall } from '@/lib/install';
import { InstallScreen } from '@/screens';

/** /install: one-click install where the browser allows it, step-by-step everywhere else. */
export function InstallContainer() {
  const router = useRouter();
  const install = useInstall();
  const [shareUrl, setShareUrl] = useState(`${BASE_PATH}/install`);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const url = `${window.location.origin}${BASE_PATH}/install`;
    setShareUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, []);
  return (
    <InstallScreen
      platform={install.platform}
      canPrompt={install.canPrompt}
      installed={install.installed}
      shareUrl={shareUrl}
      qrDataUrl={qrDataUrl}
      copied={copied}
      onInstall={() => void install.prompt()}
      onCopyLink={() => {
        void navigator.clipboard?.writeText(shareUrl).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      onBack={() => router.push('/')}
    />
  );
}
