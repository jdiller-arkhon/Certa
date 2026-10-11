import type { Metadata } from 'next';
import { SharedPacketContainer } from '@/containers/SharedPacketContainer';

// Secret-link pages: never indexed, and the token never leaks to other sites via Referer.
export const metadata: Metadata = {
  title: 'Inspector packet · Certa',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedPacketContainer token={token} />;
}
