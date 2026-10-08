'use client';

import { can, displayDate, ruleRowFromApi } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { keys } from '@/data/session';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { RulePackAdminScreen } from '@/screens';

export function RulePackAdminContainer() {
  const { org, role, mapCtx } = useCurrentOrg();
  const orgId = org.organization.id;
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ search: '', appliesTo: null as string | null, unverifiedOnly: false });
  const [mutationError, setMutationError] = useState<string | null>(null);

  const rules = useQuery({
    queryKey: keys.rules(orgId),
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/rules', { params: { path: { orgId }, query: {} } })),
  });
  const onDone = {
    onSuccess: (data: NonNullable<typeof rules.data>) => {
      setMutationError(null);
      qc.setQueryData(keys.rules(orgId), data);
    },
    onError: (err: unknown) => setMutationError(err instanceof CertaApiError ? err.message : 'Could not save the change.'),
  };
  const setOverride = useMutation({
    mutationFn: async (v: { ruleId: string; value: unknown; reason: string }) =>
      unwrap(await api.PUT('/api/v1/orgs/{orgId}/rules/{ruleId}/override', { params: { path: { orgId, ruleId: v.ruleId }, query: {} }, body: { value: v.value, reason: v.reason } })),
    ...onDone,
  });
  const clearOverride = useMutation({
    mutationFn: async (v: { ruleId: string; reason: string }) =>
      unwrap(await api.DELETE('/api/v1/orgs/{orgId}/rules/{ruleId}/override', { params: { path: { orgId, ruleId: v.ruleId }, query: {} }, body: { reason: v.reason } })),
    ...onDone,
  });

  const data = rules.data;
  const canOverride = can(role, 'rules.override');
  const q = filter.search.trim().toLowerCase();
  const rows = (data?.rules ?? [])
    .filter((r) => !filter.unverifiedOnly || r.needsVerification)
    .filter((r) => !filter.appliesTo || r.appliesTo === filter.appliesTo)
    .filter((r) => !q || `${r.id} ${r.title} ${r.source.citation}`.toLowerCase().includes(q))
    .map((r) => ruleRowFromApi(r as Parameters<typeof ruleRowFromApi>[0], mapCtx, canOverride));

  return (
    <RulePackAdminScreen
      loading={rules.isLoading || setOverride.isPending || clearOverride.isPending}
      error={mutationError ?? (rules.error ? 'We couldn’t load the rule pack.' : null)}
      pack={
        data
          ? {
              jurisdiction: data.pack.jurisdiction,
              name: data.pack.name,
              version: data.pack.version,
              authority: data.pack.authority,
              effectiveFrom: displayDate(data.pack.effectiveFrom, mapCtx.today),
              disclaimer: data.pack.disclaimer,
              ruleCount: data.pack.ruleCount,
              unverifiedCount: data.pack.unverifiedCount,
            }
          : null
      }
      availableJurisdictions={data ? [{ jurisdiction: data.pack.jurisdiction, name: data.pack.name, active: true }] : []}
      credentialTypes={(data?.credentialTypes ?? []).map((c) => {
        const rule = c.validityRuleId ? data?.rules.find((r) => r.id === c.validityRuleId) : null;
        return { id: c.id, label: c.label, description: c.description, validity: rule ? `${rule.statedAs ?? ''} (${rule.source.citation})`.trim() : 'Does not expire', requiredForCurrency: c.requiredForCurrency };
      })}
      rules={rows}
      filter={filter}
      empty={{ title: 'No rules match', body: 'Try clearing the search or filters.', actionLabel: null }}
      onFilterChange={setFilter}
      onSetOverride={(v) => setOverride.mutate(v)}
      onClearOverride={(v) => clearOverride.mutate(v)}
      onSelectJurisdiction={() => {}}
    />
  );
}
