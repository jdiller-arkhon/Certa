'use client';

import { buildInsurance, buildMaintenance } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useRouter } from 'next/navigation';
import { ensureOk, useFleetMutation, useMaintenanceEvents } from '@/data/fleet';
import { api } from '@/lib/api';
import { InsuranceScreen, MaintenanceScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

const parseTarget = (key: string) => {
  const [type, id] = key.split(':') as ['aircraft' | 'battery' | 'component', string];
  return { type, id };
};

export function MaintenanceContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const events = useMaintenanceEvents(f.orgId);
  const addSchedule = useFleetMutation(f.orgId, async (v: { target: string; name: string; everyHours: number | null; everyFlights: number | null; everyDays: number | null; groundsWhenOverdue: boolean }) =>
    unwrap(
      await api.POST('/api/v1/orgs/{orgId}/maintenance/schedules', {
        params: { path: { orgId: f.orgId } },
        body: {
          name: v.name,
          target: parseTarget(v.target),
          everyFlightSeconds: v.everyHours ? Math.round(v.everyHours * 3600) : null,
          everyFlights: v.everyFlights ? Math.round(v.everyFlights) : null,
          everyDays: v.everyDays ? Math.round(v.everyDays) : null,
          groundsWhenOverdue: v.groundsWhenOverdue,
        },
      }),
    ),
  );
  const logWork = useFleetMutation(
    f.orgId,
    async (v: { scheduleId: string | null; target: string; performedOn: string; performedBy: string; description: string }) =>
      unwrap(
        await api.POST('/api/v1/orgs/{orgId}/maintenance/events', {
          params: { path: { orgId: f.orgId } },
          // Noon UTC keeps the calendar date stable in every US time zone.
          body: { scheduleId: v.scheduleId, target: parseTarget(v.target), performedAt: `${v.performedOn}T12:00:00.000Z`, performedBy: v.performedBy, description: v.description },
        }),
      ),
    { maintenance: true },
  );
  const removeSchedule = useFleetMutation(f.orgId, async (scheduleId: string) =>
    ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/maintenance/schedules/{scheduleId}', { params: { path: { orgId: f.orgId, scheduleId } } })),
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <MaintenanceScreen
      {...buildMaintenance(f.bi, events.data ?? [])}
      loading={events.isLoading}
      saving={addSchedule.isPending || logWork.isPending}
      error={addSchedule.error ?? logWork.error ?? removeSchedule.error ?? f.loadError}
      onAddSchedule={(v) => addSchedule.mutate(v)}
      onLogMaintenance={(v) => logWork.mutate(v)}
      onRemoveSchedule={(id) => removeSchedule.mutate(id)}
      onOpenTarget={(href) => router.push(href)}
    />
  );
}

export function InsuranceContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const add = useFleetMutation(f.orgId, async (v: { carrier: string; policyNumber: string; coverageSummary: string | null; liabilityLimitDollars: number | null; effectiveOn: string; expiresOn: string; coveredAircraftIds: string[] }) => {
    const { liabilityLimitDollars, ...rest } = v;
    return unwrap(
      await api.POST('/api/v1/orgs/{orgId}/insurance', {
        params: { path: { orgId: f.orgId } },
        body: { ...rest, liabilityLimitCents: liabilityLimitDollars == null ? null : Math.round(liabilityLimitDollars * 100) },
      }),
    );
  });
  const remove = useFleetMutation(f.orgId, async (policyId: string) =>
    ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/insurance/{policyId}', { params: { path: { orgId: f.orgId, policyId } } })),
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <InsuranceScreen
      {...buildInsurance(f.bi)}
      saving={add.isPending}
      error={add.error ?? remove.error ?? f.loadError}
      onAddPolicy={(v) => add.mutate(v)}
      onRemovePolicy={(id) => remove.mutate(id)}
      onOpenAircraft={(id) => router.push(`/aircraft/${id}`)}
    />
  );
}
