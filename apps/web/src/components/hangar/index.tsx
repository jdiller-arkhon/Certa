'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '../ui/feedback';
import type { HangarProps } from './Hangar';
import type { AircraftViewerProps } from './Viewer';

/** The 3D hangar, loaded on demand so three.js only downloads where it's shown. */
export const HangarHero = dynamic<HangarProps>(() => import('./Hangar'), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] rounded-[28px] sm:h-[480px]" />,
});

/** One aircraft on a studio turntable, for its detail page. Also loaded on demand. */
export const AircraftViewer = dynamic<AircraftViewerProps>(() => import('./Viewer'), {
  ssr: false,
  loading: () => <Skeleton className="h-[320px] sm:h-[380px]" />,
});
