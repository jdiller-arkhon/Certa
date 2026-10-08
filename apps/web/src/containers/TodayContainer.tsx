'use client';

import { displayDate } from '@certa/core';
import { useRouter } from 'next/navigation';
import { useCurrentOrg } from '@/lib/current-org';
import { TodayScreen } from '@/screens';

/**
 * Phase 1: pilots and aircraft endpoints don't exist yet, so Today renders its empty state.
 * Phase 2 wires the readiness endpoint here.
 */
export function TodayContainer() {
  const { mapCtx } = useCurrentOrg();
  const router = useRouter();
  return (
    <TodayScreen
      loading={false}
      error={null}
      asOf={displayDate(mapCtx.today, mapCtx.today)}
      overall={{ level: 'green', label: 'Nothing tracked yet' }}
      counts={{ green: 0, amber: 0, red: 0 }}
      pilots={[]}
      aircraft={[]}
      upcoming={[]}
      empty={{ title: 'Add your first pilot and aircraft', body: 'Certa tracks certificates, registrations, and maintenance so you know who and what is legal to fly today.', actionLabel: 'Add aircraft' }}
      onAddPilot={() => router.push('/pilots/new')}
      onAddAircraft={() => router.push('/aircraft/new')}
      onLogFlight={() => router.push('/flights/new')}
      onOpen={(href) => router.push(href)}
    />
  );
}
