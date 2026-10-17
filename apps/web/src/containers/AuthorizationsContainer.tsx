'use client';

import { buildAuthorizations } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureOk, fieldErrorsOf, fleetKeys, messageOf, useAuthorizations } from '@/data/fleet';
import { api } from '@/lib/api';
import { AuthorizationsScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

export function AuthorizationsContainer() {
  const f = useFleetContext();
  const qc = useQueryClient();
  const list = useAuthorizations(f.orgId);
  const refresh = () => qc.invalidateQueries({ queryKey: fleetKeys.authorizations(f.orgId) });
  const save = useMutation({
    mutationFn: async ({ id, ...body }: Parameters<React.ComponentProps<typeof AuthorizationsScreen>['onSave']>[0]) => {
      const path = { orgId: f.orgId };
      return id
        ? unwrap(await api.PATCH('/api/v1/orgs/{orgId}/authorizations/{authorizationId}', { params: { path: { ...path, authorizationId: id } }, body }))
        : unwrap(await api.POST('/api/v1/orgs/{orgId}/authorizations', { params: { path }, body }));
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (authorizationId: string) => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/authorizations/{authorizationId}', { params: { path: { orgId: f.orgId, authorizationId } } })),
    onSettled: refresh,
  });
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const err = save.error ?? remove.error ?? list.error;
  return (
    <AuthorizationsScreen
      {...buildAuthorizations(f.bi, list.data ?? [], { ownPilotId: f.myPilotId })}
      loading={list.isLoading}
      saving={save.isPending}
      error={err ? messageOf(err) : null}
      fieldErrors={fieldErrorsOf(save.error)}
      onSave={(v) => save.mutate(v)}
      onDelete={(id) => remove.mutate(id)}
    />
  );
}
