'use client';

import { dateInZone, type MapContext, type UnitsPreference } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { clearOfflineCache, networkFirst } from './offline';

export const keys = {
  me: ['me'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  rules: (orgId: string) => ['org', orgId, 'rules'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  audit: (orgId: string, filter: object) => ['org', orgId, 'audit', filter] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await networkFirst('me', async () => unwrap(await api.GET('/api/v1/me')));
      } catch (err) {
        if (err instanceof CertaApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
}

export function useOrgContext(orgId: string | null) {
  return useQuery({
    queryKey: keys.org(orgId ?? 'none'),
    enabled: !!orgId,
    queryFn: () => networkFirst(`org:${orgId}`, async () => unwrap(await api.GET('/api/v1/orgs/{orgId}', { params: { path: { orgId: orgId! } } }))),
  });
}

export function mapContextFor(org: { timezone: string; units: UnitsPreference }): MapContext {
  const now = new Date();
  return { now, today: dateInZone(now, org.timezone), units: org.units, orgTimeZone: org.timezone };
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(withBase('/api/auth/sign-out'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      // Cached records must not outlive the session on a shared device. Unsynced flights stay
      // in the outbox, tagged with their author, and only sync when that user signs in again.
      await clearOfflineCache();
    },
    onSuccess: () => qc.clear(),
  });
}
