'use client';

import { buildAircraftDetail, buildAircraftList, buildBatteryList, can, kgTo, REMOTE_ID_LABEL, toKg, type AircraftListScreenProps, type Flight } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFleetMutation, useRecentFlights } from '@/data/fleet';
import { api } from '@/lib/api';
import { AircraftDetailScreen, AircraftFormScreen, AircraftListScreen, BatteryListScreen } from '@/screens';
import { exportLogbook } from './logbook';
import { FleetPending, useFleetContext } from './_fleet';
import { useSharePacket } from './_share';

export function AircraftListContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AircraftListScreenProps['statusFilter']>('all');
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <AircraftListScreen
      {...buildAircraftList(f.bi, search, status)}
      error={f.loadError}
      onSearch={setSearch}
      onStatusFilter={setStatus}
      onAddAircraft={() => router.push('/aircraft/new')}
      onOpenAircraft={(id) => router.push(`/aircraft/${id}`)}
    />
  );
}

export function AircraftDetailContainer({ aircraftId }: { aircraftId: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const recent = useRecentFlights(f.orgId, { aircraftId });
  const sharing = useSharePacket(f.orgId, { type: 'aircraft', id: aircraftId }, can(f.role, 'exports.create'), f.mapCtx);
  const ground = useFleetMutation(f.orgId, async (v: { reason: string }) =>
    unwrap(await api.POST('/api/v1/orgs/{orgId}/aircraft/{aircraftId}/ground', { params: { path: { orgId: f.orgId, aircraftId } }, body: v })),
  );
  const unground = useFleetMutation(
    f.orgId,
    async (v: { reason: string }) => unwrap(await api.POST('/api/v1/orgs/{orgId}/aircraft/{aircraftId}/return-to-service', { params: { path: { orgId: f.orgId, aircraftId } }, body: v })),
    { maintenance: true },
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const data = buildAircraftDetail(f.bi, aircraftId, recent.flights as Flight[]);
  return (
    <AircraftDetailScreen
      {...data}
      loading={ground.isPending || unground.isPending}
      error={ground.error ?? unground.error ?? sharing.error ?? f.loadError}
      share={sharing.share}
      onCreateShareLink={sharing.onCreateShareLink}
      onRevokeShareLink={sharing.onRevokeShareLink}
      onEdit={() => router.push(`/aircraft/${aircraftId}/edit`)}
      onGround={(v) => ground.mutate(v)}
      onUnground={(v) => unground.mutate(v)}
      onExportLogbook={() => exportLogbook(f.orgId, f.bi!, { aircraftId }, data.aircraft?.name ?? 'aircraft')}
      onOpenFlight={(id) => router.push(`/flights/${id}`)}
    />
  );
}

const REMOTE_ID_OPTIONS = ['standard', 'broadcast_module', 'fria', 'none'].map((value) => ({ value, label: REMOTE_ID_LABEL[value]! }));

export function AircraftFormContainer({ aircraftId }: { aircraftId?: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const massUnit = f.mapCtx.units.mass;
  const save = useFleetMutation(
    f.orgId,
    async (body: Record<string, unknown>) =>
      aircraftId
        ? unwrap(await api.PATCH('/api/v1/orgs/{orgId}/aircraft/{aircraftId}', { params: { path: { orgId: f.orgId, aircraftId } }, body: body as never }))
        : unwrap(await api.POST('/api/v1/orgs/{orgId}/aircraft', { params: { path: { orgId: f.orgId } }, body: body as never })),
    { onSuccess: (a) => router.replace(`/aircraft/${(a as { id: string }).id}`) },
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const a = aircraftId ? f.bi.snapshot.aircraft.find((x) => x.id === aircraftId) : undefined;
  const values = {
    nickname: a?.nickname ?? '',
    make: a?.make ?? '',
    model: a?.model ?? '',
    serialNumber: a?.serialNumber ?? '',
    registrationNumber: a?.registrationNumber ?? '',
    registrationExpiresOn: a?.registrationExpiresOn ?? '',
    remoteIdMethod: a?.remoteIdMethod ?? 'standard',
    remoteIdSerial: a?.remoteIdSerial ?? '',
    takeoffMass: a?.takeoffMassKg != null ? String(Math.round(kgTo(a.takeoffMassKg, massUnit) * 100) / 100) : '',
    firmwareVersion: a?.firmwareVersion ?? '',
  };
  return (
    <AircraftFormScreen
      mode={aircraftId ? 'edit' : 'create'}
      loading={false}
      error={save.error ?? (aircraftId && !a ? 'Aircraft not found.' : null)}
      values={values}
      massUnitLabel={massUnit}
      remoteIdOptions={REMOTE_ID_OPTIONS}
      fieldErrors={{ ...save.fieldErrors, ...localErrors, ...(save.fieldErrors.takeoffMassKg ? { takeoffMass: save.fieldErrors.takeoffMassKg } : {}) }}
      saving={save.isPending}
      onSubmit={(v) => {
        const mass = v.takeoffMass.trim() ? Number(v.takeoffMass) : null;
        if (mass !== null && !(mass > 0)) return setLocalErrors({ takeoffMass: 'Enter a positive number' });
        setLocalErrors({});
        const opt = (s: string) => s.trim() || null;
        save.mutate({
          nickname: opt(v.nickname),
          make: v.make.trim(),
          model: v.model.trim(),
          serialNumber: v.serialNumber.trim(),
          registrationNumber: opt(v.registrationNumber),
          registrationExpiresOn: opt(v.registrationExpiresOn),
          remoteIdMethod: v.remoteIdMethod,
          remoteIdSerial: v.remoteIdMethod === 'none' || v.remoteIdMethod === 'fria' ? null : opt(v.remoteIdSerial),
          takeoffMassKg: mass === null ? null : Math.round(toKg(mass, massUnit) * 1000) / 1000,
          firmwareVersion: opt(v.firmwareVersion),
        });
      }}
      onCancel={() => router.back()}
    />
  );
}

export function BatteryListContainer() {
  const f = useFleetContext();
  const create = useFleetMutation(f.orgId, async (v: { serialNumber: string; label: string | null; aircraftModel: string | null; cellCount: number | null; ratedCapacityMah: number | null; maxCycles: number | null }) => {
    const { maxCycles, ...rest } = v;
    return unwrap(await api.POST('/api/v1/orgs/{orgId}/batteries', { params: { path: { orgId: f.orgId } }, body: { ...rest, ...(maxCycles ? { thresholds: { maxCycles } } : {}) } }));
  });
  const retire = useFleetMutation(f.orgId, async (batteryId: string) =>
    unwrap(await api.PATCH('/api/v1/orgs/{orgId}/batteries/{batteryId}', { params: { path: { orgId: f.orgId, batteryId } }, body: { status: 'retired' } })),
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <BatteryListScreen
      {...buildBatteryList(f.bi)}
      error={create.error ?? retire.error ?? f.loadError}
      saving={create.isPending}
      fieldErrors={create.fieldErrors}
      onAddBattery={() => create.clearError()}
      onCreateBattery={(v) => create.mutate(v)}
      onRetireBattery={(id) => retire.mutate(id)}
      onOpenBattery={() => {}}
    />
  );
}
