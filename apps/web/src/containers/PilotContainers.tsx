'use client';

import { buildPilotDetail, buildPilotList, type Flight } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ensureOk, useFleetMutation, useRecentFlights } from '@/data/fleet';
import { api } from '@/lib/api';
import { PilotDetailScreen, PilotFormScreen, PilotListScreen } from '@/screens';
import { exportLogbook } from './logbook';
import { FleetPending, useFleetContext } from './_fleet';

export function PilotListContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const [search, setSearch] = useState('');
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <PilotListScreen
      {...buildPilotList(f.bi, search)}
      error={f.loadError}
      onSearch={setSearch}
      onAddPilot={() => router.push('/pilots/new')}
      onOpenPilot={(id) => router.push(`/pilots/${id}`)}
    />
  );
}

export function PilotDetailContainer({ pilotId }: { pilotId: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const recent = useRecentFlights(f.orgId, { pilotId });
  const addCred = useFleetMutation(f.orgId, async (v: { credentialType: string; identifier: string | null; issuedOn: string | null; expiresOn: string | null }) =>
    unwrap(await api.POST('/api/v1/orgs/{orgId}/pilots/{pilotId}/credentials', { params: { path: { orgId: f.orgId, pilotId } }, body: v })),
  );
  const updateCred = useFleetMutation(f.orgId, async ({ credentialId, ...body }: { credentialId: string; identifier: string | null; issuedOn: string | null; expiresOn: string | null }) =>
    unwrap(await api.PATCH('/api/v1/orgs/{orgId}/credentials/{credentialId}', { params: { path: { orgId: f.orgId, credentialId } }, body })),
  );
  const removeCred = useFleetMutation(f.orgId, async (credentialId: string) =>
    ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/credentials/{credentialId}', { params: { path: { orgId: f.orgId, credentialId } } })),
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const data = buildPilotDetail(f.bi, pilotId, recent.flights as Flight[]);
  return (
    <PilotDetailScreen
      {...data}
      loading={addCred.isPending || updateCred.isPending || removeCred.isPending}
      error={addCred.error ?? updateCred.error ?? removeCred.error ?? f.loadError}
      onEditPilot={() => router.push(`/pilots/${pilotId}/edit`)}
      onAddCredential={({ file: _file, ...v }) => addCred.mutate(v)}
      onEditCredential={() => {}}
      onUpdateCredential={(v) => updateCred.mutate(v)}
      onRemoveCredential={(id) => removeCred.mutate(id)}
      onExportLogbook={() => exportLogbook(f.orgId, f.bi!, { pilotId }, data.pilot?.name ?? 'pilot')}
      onOpenFlight={(id) => router.push(`/flights/${id}`)}
    />
  );
}

export function PilotFormContainer({ pilotId }: { pilotId?: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const save = useFleetMutation(
    f.orgId,
    async (v: { displayName: string; email: string; phone: string; certificateNumber: string }) => {
      const body = { displayName: v.displayName.trim(), email: v.email.trim() || null, phone: v.phone.trim() || null, certificateNumber: v.certificateNumber.trim() || null };
      return pilotId
        ? unwrap(await api.PATCH('/api/v1/orgs/{orgId}/pilots/{pilotId}', { params: { path: { orgId: f.orgId, pilotId } }, body }))
        : unwrap(await api.POST('/api/v1/orgs/{orgId}/pilots', { params: { path: { orgId: f.orgId } }, body }));
    },
    { onSuccess: (p) => router.replace(`/pilots/${(p as { id: string }).id}`) },
  );
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const p = pilotId ? f.bi.snapshot.pilots.find((x) => x.id === pilotId) : undefined;
  return (
    <PilotFormScreen
      mode={pilotId ? 'edit' : 'create'}
      loading={false}
      error={save.error ?? (pilotId && !p ? 'Pilot not found.' : null)}
      values={{ displayName: p?.displayName ?? '', email: p?.email ?? '', phone: p?.phone ?? '', certificateNumber: p?.certificateNumber ?? '', inviteAsUser: false, role: 'pilot' }}
      fieldErrors={save.fieldErrors}
      saving={save.isPending}
      onSubmit={(v) => save.mutate(v)}
      onCancel={() => router.back()}
    />
  );
}
