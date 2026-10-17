'use client';

import { buildMissionDetail, buildMissionForm, buildMissions, displayInstant, toMetres, weatherSummary, type ConditionsResponse, type Flight } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ensureOk, fieldErrorsOf, fleetKeys, messageOf, useAuthorizations, useFlights, useMission, useMissions } from '@/data/fleet';
import { api } from '@/lib/api';
import { MissionDetailScreen, MissionFormScreen, MissionsScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

export function MissionsContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const missions = useMissions(f.orgId);
  const auths = useAuthorizations(f.orgId);
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const err = missions.error ?? auths.error;
  return (
    <MissionsScreen
      {...buildMissions(f.bi, missions.data ?? [], auths.data ?? [])}
      loading={missions.isLoading}
      error={err ? messageOf(err) : null}
      onPlanMission={() => router.push('/missions/new')}
      onOpenMission={(id) => router.push(`/missions/${id}`)}
    />
  );
}

export function MissionDetailContainer({ missionId }: { missionId: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const qc = useQueryClient();
  const mission = useMission(f.orgId, missionId);
  const auths = useAuthorizations(f.orgId);
  const flights = useFlights(f.orgId, { pilotId: null, aircraftId: null, from: null, to: null, missionId });
  const [conditions, setConditions] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: ConditionsResponse | null; error: string | null }>({ status: 'idle', data: null, error: null });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: fleetKeys.missions(f.orgId) }), qc.invalidateQueries({ queryKey: fleetKeys.mission(f.orgId, missionId) })]);
  const setStatus = useMutation({
    mutationFn: async (status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled') => unwrap(await api.PATCH('/api/v1/orgs/{orgId}/missions/{missionId}', { params: { path: { orgId: f.orgId, missionId } }, body: { status } })),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/missions/{missionId}', { params: { path: { orgId: f.orgId, missionId } } })),
    onSuccess: async () => {
      await refresh();
      router.replace('/missions');
    },
  });
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const m = mission.data ?? null;
  const checkConditions = async () => {
    if (!m?.location) return;
    setConditions((c) => ({ ...c, status: 'loading', error: null }));
    try {
      const data = unwrap(await api.GET('/api/v1/orgs/{orgId}/conditions', { params: { path: { orgId: f.orgId }, query: { lat: m.location!.lat, lon: m.location!.lon } } })) as ConditionsResponse;
      setConditions({ status: 'ready', data, error: null });
    } catch (err) {
      setConditions({ status: 'error', data: null, error: err instanceof TypeError ? 'No connection — conditions need a signal.' : 'Couldn’t check conditions right now.' });
    }
  };
  const data = buildMissionDetail(f.bi, m, { authorizations: auths.data ?? [], flights: (flights.data?.pages.flatMap((p) => p.items) ?? []) as Flight[], ownPilotId: f.myPilotId });
  const err = setStatus.error ?? remove.error ?? mission.error;
  return (
    <MissionDetailScreen
      {...data}
      loading={mission.isLoading}
      error={err ? messageOf(err) : null}
      busy={setStatus.isPending || remove.isPending}
      conditions={{
        status: conditions.status,
        advisories: conditions.data?.advisories ?? [],
        weatherSummary: weatherSummary(conditions.data?.weather ?? null, f.mapCtx.units),
        checkedAt: conditions.data ? displayInstant(conditions.data.checkedAt, f.mapCtx.orgTimeZone, new Date()) : null,
        error: conditions.error,
      }}
      onEdit={() => router.push(`/missions/${missionId}/edit`)}
      onLogFlight={() => router.push(`/flights/new?mission=${missionId}`)}
      onSetStatus={(s) => setStatus.mutate(s)}
      onDelete={() => remove.mutate()}
      onCheckConditions={() => void checkConditions()}
      onOpenFlight={(id) => router.push(`/flights/${id}`)}
      onOpenHref={(href) => router.push(href)}
    />
  );
}

export function MissionFormContainer({ missionId }: { missionId?: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const qc = useQueryClient();
  const mission = useMission(f.orgId, missionId ?? '');
  const auths = useAuthorizations(f.orgId);
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      missionId
        ? unwrap(await api.PATCH('/api/v1/orgs/{orgId}/missions/{missionId}', { params: { path: { orgId: f.orgId, missionId } }, body: body as never }))
        : unwrap(await api.POST('/api/v1/orgs/{orgId}/missions', { params: { path: { orgId: f.orgId } }, body: body as never })),
    onSuccess: async (m) => {
      await qc.invalidateQueries({ queryKey: fleetKeys.missions(f.orgId) });
      router.replace(`/missions/${m.id}`);
    },
  });
  if (!f.bi || (missionId && mission.isLoading)) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const data = buildMissionForm(f.bi, mission.data ?? null, { authorizations: auths.data ?? [] });
  const lengthUnit = f.mapCtx.units.length;
  return (
    // Remount once the mission (or the authorizations it lists) arrives, so the form starts from it.
    <MissionFormScreen
      key={`${mission.data?.updatedAt ?? 'new'}:${auths.data ? 'a' : ''}`}
      {...data}
      error={save.error ? messageOf(save.error) : missionId && !mission.data ? 'Mission not found.' : null}
      fieldErrors={fieldErrorsOf(save.error)}
      saving={save.isPending}
      onSubmit={(v) =>
        save.mutate({
          name: v.name,
          purpose: v.purpose,
          plannedStart: v.plannedStart,
          plannedEnd: v.plannedEnd,
          locationName: v.locationName,
          location: v.location,
          maxAltitudeAglM: v.maxAltitude == null ? null : Math.round(toMetres(v.maxAltitude, lengthUnit) * 10) / 10,
          operationType: v.operationType,
          deliverables: v.deliverables,
          crew: [...(v.picId ? [{ pilotId: v.picId, role: 'pic' }] : []), ...v.observerIds.map((pilotId) => ({ pilotId, role: 'observer' }))],
          aircraftIds: v.aircraftIds,
          authorizationIds: v.authorizationIds,
          // Editing keeps the mission's status; only a new plan picks draft or planned.
          ...(missionId ? {} : { status: v.status }),
        })
      }
      onCancel={() => router.back()}
    />
  );
}
