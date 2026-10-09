import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PREVIEW_ENABLED } from '@/preview/enabled';

export const metadata = { title: 'Certa — Screen preview', robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (!PREVIEW_ENABLED) notFound();
  return children;
}
