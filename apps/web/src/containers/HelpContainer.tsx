'use client';

import { useRouter } from 'next/navigation';
import { HelpScreen } from '@/screens';

/** /help: static guide; its buttons open the matching screens. */
export function HelpContainer() {
  const router = useRouter();
  return <HelpScreen onOpen={(href) => router.push(href)} />;
}
