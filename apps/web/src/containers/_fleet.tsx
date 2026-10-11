'use client';

import { fleetReadiness, type BuildInput } from '@certa/core';
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Banner, SkeletonRows } from '@/components/ui/feedback';
import { messageOf, useFleet } from '@/data/fleet';
import { useCurrentOrg } from '@/lib/current-org';

/** Current org + fleet snapshot + a BuildInput for the core screen builders. */
export function useFleetContext() {
  const cur = useCurrentOrg();
  const orgId = cur.org.organization.id;
  const fleet = useFleet(orgId);
  const bi = useMemo<BuildInput | null>(() => {
    if (!fleet.data) return null;
    return { snapshot: fleet.data, ctx: cur.mapCtx, role: cur.role, readiness: fleetReadiness(fleet.data, cur.mapCtx) };
  }, [fleet.data, cur.mapCtx, cur.role]);
  // The signed-in user's own pilot record, if they fly.
  const myPilotId = fleet.data?.pilots.find((p) => p.membershipId === cur.org.membership.id && !p.deletedAt)?.id ?? null;
  return { ...cur, orgId, fleet, bi, myPilotId, loadError: fleet.error ? messageOf(fleet.error, 'We couldn’t load your fleet.') : null };
}

/** Shown until the first snapshot arrives (screens render their own loading after that). */
export function FleetPending({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error) return <Banner tone="error" onRetry={onRetry}>{error}</Banner>;
  return (
    <Card className="p-6">
      <SkeletonRows rows={5} />
    </Card>
  );
}

/** Download text as a file (logbook CSV exports). */
export function download(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
