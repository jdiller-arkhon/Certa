'use client';

import { buildReadinessDashboard, type ActionFixInput } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { messageOf, useFleetMutation } from '@/data/fleet';
import { api } from '@/lib/api';
import { TodayScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

export function TodayContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const [fixing, setFixing] = useState<string[]>([]);
  const [fixError, setFixError] = useState<string | null>(null);
  // Hiding the checklist is remembered per organization on this device.
  const hideKey = `certa.gettingStarted.hidden.${f.orgId}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(hideKey) === '1');
    } catch {
      setHidden(false);
    }
  }, [hideKey]);
  const orgId = f.orgId;
  const path = { orgId };

  // Each inline fix is one API call; the fleet snapshot refreshes afterwards so the row clears.
  const fix = useFleetMutation(
    orgId,
    async ({ fix: x, values: v }: ActionFixInput) => {
      switch (x.kind) {
        case 'renew_credential':
        case 'add_credential':
          return unwrap(await api.POST('/api/v1/orgs/{orgId}/pilots/{pilotId}/credentials', { params: { path: { ...path, pilotId: x.pilotId } }, body: { credentialType: x.credentialType, issuedOn: v.issuedOn || null, expiresOn: v.expiresOn || null, identifier: v.identifier || null } }));
        case 'renew_registration':
          return unwrap(await api.PATCH('/api/v1/orgs/{orgId}/aircraft/{aircraftId}', { params: { path: { ...path, aircraftId: x.aircraftId } }, body: { registrationNumber: v.registrationNumber?.trim() || null, registrationExpiresOn: v.expiresOn || null } }));
        case 'set_remote_id':
          return unwrap(await api.PATCH('/api/v1/orgs/{orgId}/aircraft/{aircraftId}', { params: { path: { ...path, aircraftId: x.aircraftId } }, body: { remoteIdMethod: v.remoteIdMethod as 'standard', remoteIdSerial: v.remoteIdMethod === 'fria' ? null : v.remoteIdSerial?.trim() || null } }));
        case 'log_maintenance': {
          const [type, id] = x.target.split(':') as ['aircraft' | 'battery' | 'component', string];
          return unwrap(await api.POST('/api/v1/orgs/{orgId}/maintenance/events', { params: { path }, body: { scheduleId: x.scheduleId, target: { type, id }, performedAt: `${v.performedOn}T12:00:00.000Z`, performedBy: v.performedBy!.trim(), description: `${x.scheduleName} completed.` } }));
        }
        case 'renew_insurance':
          return unwrap(await api.PATCH('/api/v1/orgs/{orgId}/insurance/{policyId}', { params: { path: { ...path, policyId: x.policyId } }, body: { expiresOn: v.expiresOn } }));
        case 'return_to_service':
          return unwrap(await api.POST('/api/v1/orgs/{orgId}/aircraft/{aircraftId}/return-to-service', { params: { path: { ...path, aircraftId: x.aircraftId } }, body: { reason: v.reason!.trim() } }));
        case 'open':
          return null;
      }
    },
    { maintenance: true },
  );

  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const data = buildReadinessDashboard(f.bi, { ownPilotId: f.myPilotId });
  return (
    <TodayScreen
      {...data}
      fixing={fixing}
      error={fixError ?? fix.error ?? f.loadError}
      onAddPilot={() => router.push('/pilots/new')}
      onAddAircraft={() => router.push('/aircraft/new')}
      onLogFlight={() => router.push('/flights/new')}
      // The first-run screen always shows the steps; later the card can be hidden.
      gettingStarted={hidden && (data.pilots.length || data.aircraft.length) ? null : data.gettingStarted}
      onDismissGettingStarted={() => {
        setHidden(true);
        try {
          localStorage.setItem(hideKey, '1');
        } catch {}
      }}
      onOpen={(href) => router.push(href)}
      onFix={(input) => {
        if (input.fix.kind === 'open') return;
        setFixError(null);
        setFixing((ids) => [...ids, input.itemId]);
        fix.mutate(input, {
          onError: (err) => setFixError(messageOf(err)),
          onSettled: () => setFixing((ids) => ids.filter((id) => id !== input.itemId)),
        });
      }}
    />
  );
}
