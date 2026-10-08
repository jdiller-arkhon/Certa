'use client';

import { can, ROLE_LABELS, ROLES, toMemberRow, type Role } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { keys } from '@/data/session';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { MembersAdminScreen } from '@/screens';

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including billing and rule-pack overrides.',
  admin: 'Everything except billing.',
  chief_pilot: 'Manage pilots, missions, checklists, and approvals.',
  pilot: 'Log own flights, run checklists, report incidents, view assigned missions.',
  maintenance_tech: 'Maintenance events, components, batteries, and grounding.',
  viewer: 'Read-only access.',
  auditor: 'Time-boxed, read-only access. Every view is logged.',
};

export function MembersAdminContainer() {
  const { org, role, me, mapCtx } = useCurrentOrg();
  const orgId = org.organization.id;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const members = useQuery({
    queryKey: keys.members(orgId),
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/members', { params: { path: { orgId } } })),
  });
  const after = {
    onSuccess: () => {
      setError(null);
      return qc.invalidateQueries({ queryKey: keys.members(orgId) });
    },
    onError: (err: unknown) => setError(err instanceof CertaApiError ? err.message : 'Could not save the change.'),
  };
  const invite = useMutation({
    mutationFn: async (body: { email: string; name: string; role: Role; expiresAt: string | null }) =>
      unwrap(await api.POST('/api/v1/orgs/{orgId}/members', { params: { path: { orgId } }, body })),
    ...after,
  });
  const update = useMutation({
    mutationFn: async (v: { membershipId: string; role?: Role; expiresAt?: string | null }) =>
      unwrap(await api.PATCH('/api/v1/orgs/{orgId}/members/{membershipId}', { params: { path: { orgId, membershipId: v.membershipId } }, body: { role: v.role, expiresAt: v.expiresAt } })),
    ...after,
  });
  const remove = useMutation({
    mutationFn: async (membershipId: string) => {
      const r = await api.DELETE('/api/v1/orgs/{orgId}/members/{membershipId}', { params: { path: { orgId, membershipId } } });
      if (!r.response.ok) unwrap(r);
    },
    ...after,
  });

  return (
    <MembersAdminScreen
      loading={members.isLoading || invite.isPending || update.isPending || remove.isPending}
      error={error ?? (members.error ? 'We couldn’t load members.' : null)}
      members={(members.data?.members ?? []).map((m) => toMemberRow(m, me.user.id, mapCtx))}
      roleOptions={ROLES.filter((r) => r !== 'owner' || role === 'owner').map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }))}
      canManage={can(role, 'members.manage')}
      empty={{ title: 'Just you so far', body: 'Invite pilots, maintenance techs, or an auditor. Each person gets a sign-in link by email.', actionLabel: 'Invite someone' }}
      onInvite={(v) => invite.mutate(v)}
      onChangeRole={(v) => update.mutate(v)}
      onSetExpiry={(v) => update.mutate(v)}
      onRemove={(id) => remove.mutate(id)}
    />
  );
}
