import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BASE_PATH } from '@/lib/base-path';
import { Providers } from '@/lib/providers';
import { RegisterServiceWorker } from '@/lib/register-sw';
import './globals.css';

export const metadata: Metadata = {
  title: 'Certa',
  description: 'Flight operations & compliance logbook',
  applicationName: 'Certa',
  appleWebApp: { capable: true, title: 'Certa', statusBarStyle: 'default' },
  icons: {
    apple: `${BASE_PATH}/icons/apple-touch-icon.png`,
    icon: [
      { url: `${BASE_PATH}/icons/icon.svg`, type: 'image/svg+xml' },
      { url: `${BASE_PATH}/icons/favicon-32.png`, type: 'image/png', sizes: '32x32' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2b2b2e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="certa">
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
