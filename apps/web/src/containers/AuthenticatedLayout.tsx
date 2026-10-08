'use client';

import { buildShell, type ThemeName } from '@certa/core';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { mapContextFor, useMe, useOrgContext, useSignOut } from '@/data/session';
import { CurrentOrgContext, readSelectedOrg, writeSelectedOrg, type CurrentOrg } from '@/lib/current-org';
import { readTheme, writeTheme } from '@/lib/theme';
import { AppShell } from '@/screens';

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const signOut = useSignOut();
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('light');

  useEffect(() => {
    setSelected(readSelectedOrg());
    const t = readTheme();
    setTheme(t);
    writeTheme(t);
  }, []);

  useEffect(() => {
    if (me.data === null && !me.isFetching) router.replace('/sign-in');
  }, [me.data, me.isFetching, router]);

  const memberships = me.data?.memberships ?? [];
  const orgId = memberships.find((m) => m.orgId === selected)?.orgId ?? memberships[0]?.orgId ?? null;
  const org = useOrgContext(orgId);

  const current = useMemo<CurrentOrg | null>(() => {
    if (!me.data || !org.data) return null;
    return {
      me: me.data,
      org: org.data,
      role: org.data.membership.role,
      mapCtx: mapContextFor(org.data.organization),
      switchOrg: (id) => {
        writeSelectedOrg(id);
        setSelected(id);
        qc.removeQueries({ queryKey: ['org'] });
      },
    };
  }, [me.data, org.data, qc]);

  if (me.isLoading || (orgId && org.isLoading)) return <p role="status">Loading…</p>;
  if (me.error || org.error) return <p role="alert">We couldn’t load your account. Refresh to try again.</p>;
  if (!me.data) return null;
  if (!current) return <p role="alert">Your account isn’t a member of any organization.</p>;

  const shell = buildShell({
    user: me.data.user,
    role: current.role,
    organization: { id: current.org.organization.id, name: current.org.organization.name },
    memberships: memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName, role: m.role })),
    activeHref: pathname,
    theme,
  });

  return (
    <CurrentOrgContext.Provider value={current}>
      <AppShell
        {...shell}
        onSwitchOrg={current.switchOrg}
        onSignOut={async () => {
          await signOut.mutateAsync();
          router.replace('/sign-in');
        }}
        onNavigate={(href) => router.push(href)}
        onThemeChange={(t) => {
          setTheme(t);
          writeTheme(t);
        }}
        onSyncNow={() => qc.invalidateQueries()}
      >
        {children}
      </AppShell>
    </CurrentOrgContext.Provider>
  );
}
