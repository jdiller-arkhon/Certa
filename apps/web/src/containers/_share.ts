'use client';

import { displayDate, type MapContext, type SharePacketViewModel } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { messageOf } from '@/data/fleet';
import { api } from '@/lib/api';

/** Inspector packet links for one pilot or aircraft: list, create (URL shown once), revoke. */
export function useSharePacket(orgId: string, subject: { type: 'pilot' | 'aircraft'; id: string }, canShare: boolean, ctx: MapContext) {
  const qc = useQueryClient();
  const key = ['org', orgId, 'share-links', subject.id];
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const links = useQuery({
    queryKey: key,
    enabled: canShare,
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/share-links', { params: { path: { orgId }, query: { subjectId: subject.id } } })).links,
  });
  const create = useMutation({
    mutationFn: async (v: { expiresInDays: number }) =>
      unwrap(await api.POST('/api/v1/orgs/{orgId}/share-links', { params: { path: { orgId } }, body: { subjectType: subject.type, subjectId: subject.id, expiresInDays: v.expiresInDays } })),
    onSuccess: (l) => {
      setCreatedUrl(l.url);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({
    mutationFn: async (linkId: string) => unwrap(await api.POST('/api/v1/orgs/{orgId}/share-links/{linkId}/revoke', { params: { path: { orgId, linkId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const now = Date.now();
  const share: SharePacketViewModel = {
    canShare,
    createdUrl,
    creating: create.isPending,
    links: (links.data ?? []).map((l) => {
      const expired = Date.parse(l.expiresAt) <= now;
      const active = !l.revokedAt && !expired;
      return {
        id: l.id,
        label: l.label,
        expires: displayDate(l.expiresAt.slice(0, 10), ctx.today),
        viewCount: l.viewCount,
        active,
        status: l.revokedAt ? { level: 'red' as const, label: 'Revoked' } : expired ? { level: 'amber' as const, label: 'Expired' } : { level: 'green' as const, label: 'Active' },
      };
    }),
  };
  return {
    share,
    error: create.error ? messageOf(create.error) : revoke.error ? messageOf(revoke.error) : null,
    onCreateShareLink: (v: { expiresInDays: number }) => create.mutate(v),
    onRevokeShareLink: (id: string) => revoke.mutate(id),
    reset: () => setCreatedUrl(null),
  };
}
