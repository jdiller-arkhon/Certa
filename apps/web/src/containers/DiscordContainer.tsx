'use client';

import { displayInstant } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ensureOk, messageOf } from '@/data/fleet';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { DiscordSettingsScreen } from '@/screens';

export function DiscordContainer() {
  const { org, mapCtx } = useCurrentOrg();
  const orgId = org.organization.id;
  const qc = useQueryClient();
  const key = ['org', orgId, 'discord-link'];
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  // While a code is showing, poll so the page flips to "Linked" as soon as the bot redeems it.
  const status = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/discord/link', { params: { path: { orgId } } })),
    refetchInterval: (q) => (code && !q.state.data?.linked ? 3000 : false),
  });
  const done = { onSettled: () => qc.invalidateQueries({ queryKey: key }) };
  const issue = useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/orgs/{orgId}/discord/link-code', { params: { path: { orgId } } })),
    onSuccess: (r) => setCode({ value: r.code, expiresAt: r.expiresAt }),
  });
  const optIn = useMutation({ mutationFn: async (on: boolean) => unwrap(await api.PATCH('/api/v1/orgs/{orgId}/discord/link', { params: { path: { orgId } }, body: { leaderboardOptIn: on } })), ...done });
  const orgSwitch = useMutation({ mutationFn: async (on: boolean) => unwrap(await api.PUT('/api/v1/orgs/{orgId}/discord/settings', { params: { path: { orgId } }, body: { leaderboardEnabled: on } })), ...done });
  const unlink = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/discord/link', { params: { path: { orgId } } })),
    onSuccess: () => setCode(null),
    ...done,
  });
  const s = status.data;
  const err = issue.error ?? optIn.error ?? orgSwitch.error ?? unlink.error ?? status.error;
  return (
    <DiscordSettingsScreen
      loading={status.isLoading}
      error={err ? messageOf(err) : null}
      canLink={s?.canLink ?? false}
      linked={s?.linked ?? false}
      linkedAt={s?.linkedAt ? displayInstant(s.linkedAt, mapCtx.orgTimeZone, new Date()) : null}
      // Switches follow the click right away; a failed save falls back to the server's value.
      leaderboardOptIn={optIn.isPending ? optIn.variables : (s?.leaderboardOptIn ?? false)}
      orgLeaderboardEnabled={orgSwitch.isPending ? orgSwitch.variables : (s?.orgLeaderboardEnabled ?? true)}
      canManageOrg={s?.canManageOrg ?? false}
      code={s?.linked ? null : code}
      busy={issue.isPending || optIn.isPending || orgSwitch.isPending || unlink.isPending}
      onGenerateCode={() => issue.mutate()}
      onUnlink={() => unlink.mutate()}
      onLeaderboardChange={(on) => optIn.mutate(on)}
      onOrgLeaderboardChange={(on) => orgSwitch.mutate(on)}
    />
  );
}
