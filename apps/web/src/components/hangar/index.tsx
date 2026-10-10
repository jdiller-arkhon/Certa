'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '../ui/feedback';
import type { HangarProps } from './Hangar';

/** The 3D hangar, loaded on demand so three.js only downloads where it's shown. */
export const HangarHero = dynamic<HangarProps>(() => import('./Hangar'), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] rounded-[28px] sm:h-[480px]" />,
});
