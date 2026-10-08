'use client';

import { toAuditEventViewModel } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { keys } from '@/data/session';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { AuditLogScreen } from '@/screens';

export function AuditLogContainer() {
  const { org, mapCtx } = useCurrentOrg();
  const orgId = org.organization.id;
  const [filter, setFilter] = useState<{ entity: string | null; actorUserId: string | null }>({ entity: null, actorUserId: null });
  const q = useInfiniteQuery({
    queryKey: keys.audit(orgId, filter),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET('/api/v1/orgs/{orgId}/audit', {
          params: {
            path: { orgId },
            query: { limit: 50, before: pageParam, table: filter.entity ?? undefined, actorUserId: filter.actorUserId ?? undefined },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const events = (q.data?.pages ?? []).flatMap((p) => p.events);
  return (
    <AuditLogScreen
      loading={q.isLoading || q.isFetchingNextPage}
      error={q.error ? 'We couldn’t load the audit log.' : null}
      events={events.map((e) => toAuditEventViewModel(e as Parameters<typeof toAuditEventViewModel>[0], mapCtx))}
      hasMore={!!q.hasNextPage}
      filter={filter}
      entityOptions={[
        { value: 'organizations', label: 'Organization' },
        { value: 'memberships', label: 'Members' },
        { value: 'pilots', label: 'Pilots' },
        { value: 'org_rule_overrides', label: 'Rule overrides' },
      ]}
      empty={{ title: 'No changes recorded yet', body: 'Every change to your records will appear here with who made it and what changed.', actionLabel: null }}
      onFilterChange={setFilter}
      onLoadMore={() => void q.fetchNextPage()}
    />
  );
}
