'use client';

import { buildChecklistsAdmin } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureOk, fleetKeys, messageOf, useChecklistTemplates } from '@/data/fleet';
import { api } from '@/lib/api';
import { ChecklistsAdminScreen } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

export function ChecklistsContainer() {
  const f = useFleetContext();
  const qc = useQueryClient();
  const templates = useChecklistTemplates(f.orgId);
  const refresh = () => qc.invalidateQueries({ queryKey: fleetKeys.checklists(f.orgId) });
  const save = useMutation({
    mutationFn: async ({ id, ...body }: Parameters<React.ComponentProps<typeof ChecklistsAdminScreen>['onSave']>[0]) => {
      const sections = body.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, photoRequired: false })) }));
      const path = { orgId: f.orgId };
      return id
        ? unwrap(await api.PUT('/api/v1/orgs/{orgId}/checklists/templates/{templateId}', { params: { path: { ...path, templateId: id } }, body: { ...body, sections } }))
        : unwrap(await api.POST('/api/v1/orgs/{orgId}/checklists/templates', { params: { path }, body: { ...body, sections } }));
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (templateId: string) => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/checklists/templates/{templateId}', { params: { path: { orgId: f.orgId, templateId } } })),
    onSettled: refresh,
  });
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  return (
    <ChecklistsAdminScreen
      {...buildChecklistsAdmin(f.bi, templates.data ?? [])}
      loading={templates.isLoading}
      saving={save.isPending}
      error={save.error ? messageOf(save.error) : remove.error ? messageOf(remove.error) : templates.error ? messageOf(templates.error) : null}
      onSave={(v) => save.mutate(v)}
      onDelete={(id) => remove.mutate(id)}
    />
  );
}
