import { buildShell, dateInZone, type AppShellViewModel, type MapContext, type ThemeName } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, sessionStore } from '@/lib/session';
import { openDatabase, pendingChangeCount } from '@/sync/db';

interface Session {
  shell: AppShellViewModel;
  mapCtx: MapContext;
  switchOrg: (orgId: string) => void;
  setTheme: (t: ThemeName) => void;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
};

export function useSignedIn() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      if (!(await sessionStore.get())) return null;
      const r = await api.GET('/api/v1/me');
      if (r.response.status === 401) {
        await sessionStore.clear();
        return null;
      }
      return unwrap(r);
    },
    // Offline: keep the last known identity rather than signing the user out.
    networkMode: 'offlineFirst',
    staleTime: 5 * 60_000,
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const me = useSignedIn();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('light');
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void openDatabase().then(() => pendingChangeCount()).then(setPending);
  }, []);
  const memberships = me.data?.memberships ?? [];
  const current = memberships.find((m) => m.orgId === orgId) ?? memberships[0];
  const org = useQuery({
    queryKey: ['org', current?.orgId],
    enabled: !!current,
    networkMode: 'offlineFirst',
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}', { params: { path: { orgId: current!.orgId } } })),
  });
  if (!me.data || !current || !org.data) return null;
  const o = org.data.organization;
  const now = new Date();
  const value: Session = {
    shell: buildShell({
      user: me.data.user,
      role: current.role,
      organization: { id: o.id, name: o.name },
      memberships: memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName, role: m.role })),
      activeHref: '/',
      theme,
      sync: {
        status: org.isError ? 'offline' : 'online',
        pendingChanges: pending,
        lastSynced: null,
        message: org.isError ? 'Offline — changes are saved on this device' : null,
        conflictCount: 0,
      },
    }),
    mapCtx: { now, today: dateInZone(now, o.timezone), units: o.units, orgTimeZone: o.timezone },
    switchOrg: (id) => {
      setOrgId(id);
      qc.removeQueries({ queryKey: ['org'] });
    },
    setTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
