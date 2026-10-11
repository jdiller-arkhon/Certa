'use client';

import { buildReadinessDashboard } from '@certa/core';
import { useRouter } from 'next/navigation';
import { TodayScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

export function TodayContainer() {
  const f = useFleetContext();
  const router = useRouter();
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <TodayScreen
      {...buildReadinessDashboard(f.bi)}
      error={f.loadError}
      onAddPilot={() => router.push('/pilots/new')}
      onAddAircraft={() => router.push('/aircraft/new')}
      onLogFlight={() => router.push('/flights/new')}
      onOpen={(href) => router.push(href)}
    />
  );
}
