'use client';

import { can, displayDate, displayInstant } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ensureOk, messageOf } from '@/data/fleet';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { useCurrentOrg } from '@/lib/current-org';
import { IntegrationsScreen } from '@/screens';

export function IntegrationsContainer() {
  const { org, role, mapCtx } = useCurrentOrg();
  const orgId = org.organization.id;
  const qc = useQueryClient();
  const key = ['org', orgId, 'api-keys'];
  const canManage = can(role, 'integrations.manage');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const keys = useQuery({
    queryKey: key,
    enabled: canManage,
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/api-keys', { params: { path: { orgId } } })).keys,
  });
  const create = useMutation({
    mutationFn: async (v: { name: string; expiresInDays: number | null }) =>
      unwrap(await api.POST('/api/v1/orgs/{orgId}/api-keys', { params: { path: { orgId } }, body: { name: v.name, scopes: ['verify:read'], ...(v.expiresInDays ? { expiresInDays: v.expiresInDays } : {}) } })),
    onSuccess: (k) => {
      setCreatedKey(k.key);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/api-keys/{keyId}', { params: { path: { orgId, keyId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <IntegrationsScreen
      loading={keys.isLoading}
      error={create.error ? messageOf(create.error) : revoke.error ? messageOf(revoke.error) : keys.error ? 'We couldn’t load API keys.' : canManage ? null : 'Only owners and admins manage integrations.'}
      keys={(keys.data ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        lastUsed: k.lastUsedAt ? displayInstant(k.lastUsedAt, mapCtx.orgTimeZone, mapCtx.now) : null,
        expires: k.expiresAt ? displayDate(k.expiresAt.slice(0, 10), mapCtx.today) : null,
        created: displayDate(k.createdAt.slice(0, 10), mapCtx.today),
      }))}
      createdKey={createdKey}
      creating={create.isPending}
      canManage={canManage}
      apiBaseUrl={`${origin}${withBase('/api/v1')}`}
      onCreateKey={(v) => create.mutate(v)}
      onRevokeKey={(id) => revoke.mutate(id)}
      onDismissKey={() => setCreatedKey(null)}
    />
  );
}
