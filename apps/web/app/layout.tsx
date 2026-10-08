import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Certa',
  description: 'Flight operations & compliance logbook',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="certa">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
