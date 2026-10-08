import { displayDate } from '@certa/core';
import { useSession } from '@/containers/session-context';
import { TodayScreen } from '@/screens';

/** Phase 1: empty Today. Phase 2 computes readiness offline from the synced SQLite store. */
export default function Today() {
  const { mapCtx } = useSession();
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
      empty={{ title: 'Add your first pilot and aircraft', body: 'Certa tracks certificates, registrations, and maintenance so you know who and what is legal to fly today.', actionLabel: null }}
      onAddPilot={() => {}}
      onAddAircraft={() => {}}
      onLogFlight={() => {}}
      onOpen={() => {}}
    />
  );
}
