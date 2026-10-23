'use client';

import {
  ANNOUNCEMENT_AUDIENCES,
  PLATFORM_PERIOD_PRESETS,
  announcementEndsAt,
  announcementVM,
  buildPlatformActivity,
  buildPlatformCompliance,
  buildPlatformOverview,
  buildPlatformPilotDetail,
  filterPlatformPilots,
  monthsEnding,
  platformDatasets,
  platformFlagOptions,
  platformPeriod,
  platformPilotRowVM,
  platformPresetRange,
  type AnnouncementDraft,
  type PlatformPeriodPreset,
  type PlatformPilotsFilter,
} from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMe } from '@/data/session';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { useCurrentOrg } from '@/lib/current-org';
import {
  PlatformActivityScreen,
  PlatformAnnouncementsScreen,
  PlatformComplianceScreen,
  PlatformOverviewScreen,
  PlatformPilotDetailScreen,
  PlatformPilotsScreen,
  PlatformReportsScreen,
} from '@/screens';

const pk = {
  all: ['platform'] as const,
  overview: (from: string, to: string) => ['platform', 'overview', from, to] as const,
  pilots: ['platform', 'pilots'] as const,
  pilot: (orgId: string, pilotId: string) => ['platform', 'pilot', orgId, pilotId] as const,
  compliance: (days: number) => ['platform', 'compliance', days] as const,
  announcements: ['platform', 'announcements'] as const,
  activity: ['platform', 'activity'] as const,
};

const today = () => new Date().toISOString().slice(0, 10);

function errorText(err: unknown, what: string): string | null {
  if (!err) return null;
  if (err instanceof CertaApiError && err.status === 403) return 'Your Arkhon admin sign-in couldn’t be confirmed. Sign in to Arkhon again, then reload.';
  if (err instanceof CertaApiError && err.status < 500) return err.message;
  return `We couldn’t load ${what}. Check your connection and try again.`;
}

/** Shows the console only to Arkhon admins; the API checks again on every request. */
function PlatformGate({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.data) return null;
  if (!me.data.arkhon?.platformAdmin)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <ShieldAlert className="size-8 text-[var(--certa-muted)]" aria-hidden />
        <h1 className="headline text-[24px]">Arkhon admins only</h1>
        <p className="text-[15px] text-[var(--certa-muted)]">The platform console is for Arkhon Industries administrators. If you should have access, ask an Arkhon admin to update your role.</p>
      </div>
    );
  return <>{children}</>;
}

/** Fetches a CSV export and saves it under the server's file name. */
async function downloadExport(dataset: string, query: Record<string, string | undefined>) {
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString();
  const res = await fetch(withBase(`/api/v1/platform/exports/${dataset}${qs ? `?${qs}` : ''}`), { credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new CertaApiError(res.status, 'export_failed', body?.error?.message ?? 'The download failed.');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `certa-${dataset}.csv`;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function usePeriod() {
  const [range, setRange] = useState(() => platformPresetRange('30d', today()));
  return {
    range,
    period: platformPeriod(range.from, range.to, today()),
    onPreset: (p: PlatformPeriodPreset) => setRange(platformPresetRange(p, today())),
    onCustom: (from: string, to: string) => setRange({ from, to }),
  };
}

function useDownloader() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (dataset: string, query: Record<string, string | undefined>, label = dataset) => {
    setDownloading(label);
    setError(null);
    try {
      await downloadExport(dataset, query);
    } catch (err) {
      setError(errorText(err, 'that export'));
    } finally {
      setDownloading(null);
    }
  };
  return { downloading, error, setError, run };
}

function remindNotice(r: { sent: number; skipped: { name: string; reason: string }[] }) {
  const sent = r.sent ? `Reminder sent to ${r.sent} pilot${r.sent === 1 ? '' : 's'}.` : 'No reminders sent.';
  const skipped = r.skipped.length ? ` Skipped ${r.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join(', ')}.` : '';
  return { tone: (r.sent ? 'info' : 'error') as 'info' | 'error', text: sent + skipped };
}

function useRemind(onDone: (notice: { tone: 'info' | 'error'; text: string }) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { keys: string[]; note?: string }) =>
      unwrap(
        await api.POST('/api/v1/platform/remind', {
          body: { pilots: input.keys.map((k) => ({ orgId: k.split(':')[0]!, pilotId: k.split(':')[1]! })), note: input.note?.trim() || undefined },
        }),
      ),
    onSuccess: (r) => {
      onDone(remindNotice(r));
      void qc.invalidateQueries({ queryKey: pk.activity });
    },
    onError: (err) => onDone({ tone: 'error', text: errorText(err, 'reminders') ?? 'Sending failed.' }),
  });
}

// ---------------------------------------------------------------- overview

export function PlatformOverviewContainer() {
  return (
    <PlatformGate>
      <Overview />
    </PlatformGate>
  );
}

function Overview() {
  const router = useRouter();
  const { range, period, onPreset, onCustom } = usePeriod();
  const dl = useDownloader();
  const q = useQuery({
    queryKey: pk.overview(range.from, range.to),
    queryFn: async () => unwrap(await api.GET('/api/v1/platform/overview', { params: { query: range } })),
    placeholderData: (prev) => prev,
  });
  const vm = useMemo(() => (q.data ? buildPlatformOverview(q.data, new Date()) : null), [q.data]);
  return (
    <PlatformOverviewScreen
      state={vm ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error, 'the console') ?? dl.error}
      period={vm?.period ?? period}
      presets={PLATFORM_PERIOD_PRESETS}
      generatedAt={vm?.generatedAt ?? null}
      kpis={vm?.kpis ?? []}
      periodStats={vm?.periodStats ?? []}
      readiness={vm?.readiness ?? []}
      months={vm?.months ?? []}
      topPilots={vm?.topPilots ?? []}
      organizations={vm?.organizations ?? []}
      onPreset={onPreset}
      onCustom={onCustom}
      onNavigate={(href) => router.push(href)}
      // The monthly summary matches the 12-month chart; anything else, the selected period.
      onDownload={(dataset) => void dl.run(dataset, dataset === 'monthly' ? { from: `${monthsEnding(range.to, 12)[0]}-01`, to: range.to } : range)}
      downloading={dl.downloading}
      onRetry={() => void q.refetch()}
    />
  );
}

// ---------------------------------------------------------------- pilots

export function PlatformPilotsContainer() {
  return (
    <PlatformGate>
      <Pilots />
    </PlatformGate>
  );
}

const DEFAULT_FILTER: PlatformPilotsFilter = { query: '', orgId: '', flag: 'any', level: 'all' };

function Pilots() {
  const router = useRouter();
  const [filter, setFilter] = useState<PlatformPilotsFilter>(DEFAULT_FILTER);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const dl = useDownloader();
  // Deep links from the overview: ?view=help|all, ?flag=<flag>.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const flag = p.get('flag');
    if (flag) setFilter((f) => ({ ...f, flag: flag as PlatformPilotsFilter['flag'] }));
    else if (p.get('view') === 'all') setFilter((f) => ({ ...f, flag: 'all' }));
  }, []);
  const q = useQuery({ queryKey: pk.pilots, queryFn: async () => unwrap(await api.GET('/api/v1/platform/pilots')) });
  const all = useMemo(() => (q.data ? q.data.pilots.map((r) => platformPilotRowVM(r, new Date())) : []), [q.data]);
  const rows = useMemo(() => filterPlatformPilots(all, filter), [all, filter]);
  const remind = useRemind(setNotice);
  const orgOptions = useMemo(() => [...new Map(all.map((r) => [r.orgId, { id: r.orgId, name: r.orgName }])).values()].sort((a, b) => a.name.localeCompare(b.name)), [all]);
  return (
    <PlatformPilotsScreen
      state={q.data ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error, 'pilots') ?? dl.error}
      rows={rows}
      totalCount={all.filter((r) => r.status.label !== 'Inactive').length}
      filter={filter}
      orgOptions={orgOptions}
      flagOptions={platformFlagOptions(all)}
      needHelpCount={all.filter((r) => r.helpFlags.length).length}
      notice={notice}
      busy={remind.isPending}
      onFilter={setFilter}
      onOpen={(r) => router.push(r.href)}
      onRemind={(keys) => remind.mutate({ keys })}
      onDownload={() => void dl.run('pilots', {})}
      onDismissNotice={() => setNotice(null)}
      onRetry={() => void q.refetch()}
    />
  );
}

// ---------------------------------------------------------------- pilot detail

export function PlatformPilotDetailContainer() {
  return (
    <PlatformGate>
      <PilotDetail />
    </PlatformGate>
  );
}

function PilotDetail() {
  const router = useRouter();
  const qc = useQueryClient();
  const current = useCurrentOrg();
  const { orgId, pilotId } = useParams<{ orgId: string; pilotId: string }>();
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'remind' | 'invite' | 'logbook' | null>(null);
  const q = useQuery({ queryKey: pk.pilot(orgId, pilotId), queryFn: async () => unwrap(await api.GET('/api/v1/platform/pilots/{orgId}/{pilotId}', { params: { path: { orgId, pilotId } } })) });
  const vm = useMemo(() => (q.data ? buildPlatformPilotDetail(q.data, new Date()) : null), [q.data]);
  const refresh = () => void qc.invalidateQueries({ queryKey: pk.all });
  const act = async (kind: 'remind' | 'invite' | 'logbook', fn: () => Promise<{ tone: 'info' | 'error'; text: string } | null>) => {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice(await fn());
      refresh();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'that') ?? 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <PlatformPilotDetailScreen
      state={vm ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error, 'this pilot')}
      pilot={vm?.pilot ?? null}
      lastSignIn={vm?.lastSignIn ?? null}
      stats={vm?.stats ?? []}
      items={vm?.items ?? []}
      months={vm?.months ?? []}
      recentFlights={vm?.recentFlights ?? []}
      otherOrganizations={vm?.otherOrganizations ?? []}
      history={vm?.history ?? []}
      tools={vm?.tools ?? { canInvite: false, inviteHint: '', arkhonAdminUrl: null, openInOrgHref: null }}
      busy={busy}
      notice={notice}
      onRemind={(note) =>
        void act('remind', async () =>
          remindNotice(unwrap(await api.POST('/api/v1/platform/remind', { body: { pilots: [{ orgId, pilotId }], note: note.trim() || undefined } }))),
        )
      }
      onInvite={() =>
        void act('invite', async () => {
          const r = unwrap(await api.POST('/api/v1/platform/pilots/{orgId}/{pilotId}/invite', { params: { path: { orgId, pilotId } } }));
          return r.sent ? { tone: 'info', text: 'Sign-in instructions sent.' } : { tone: 'error', text: r.skipped[0]?.reason ?? 'Not sent.' };
        })
      }
      onDownloadLogbook={() =>
        void act('logbook', async () => {
          await downloadExport('flights', { from: '2000-01-01', to: today(), orgId, pilotId });
          return null;
        })
      }
      onOpenInOrg={() => {
        if (!vm?.tools.openInOrgHref) return;
        if (current.org.organization.id !== orgId) current.switchOrg(orgId);
        router.push(vm.tools.openInOrgHref);
      }}
      onBack={() => router.push('/platform/pilots')}
      onDismissNotice={() => setNotice(null)}
      onRetry={() => void q.refetch()}
    />
  );
}

// ---------------------------------------------------------------- compliance

export function PlatformComplianceContainer() {
  return (
    <PlatformGate>
      <Compliance />
    </PlatformGate>
  );
}

function Compliance() {
  const router = useRouter();
  const [windowDays, setWindow] = useState(60);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const dl = useDownloader();
  const q = useQuery({ queryKey: pk.compliance(windowDays), queryFn: async () => unwrap(await api.GET('/api/v1/platform/compliance', { params: { query: { windowDays } } })), placeholderData: (p) => p });
  const vm = useMemo(() => (q.data ? buildPlatformCompliance(q.data.items, new Date()) : null), [q.data]);
  const remind = useRemind(setNotice);
  return (
    <PlatformComplianceScreen
      state={vm ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error, 'compliance') ?? dl.error}
      windowDays={windowDays}
      windowOptions={[
        { value: 30, label: '30 days' },
        { value: 60, label: '60 days' },
        { value: 90, label: '90 days' },
        { value: 365, label: 'A year' },
      ]}
      groups={vm?.groups ?? []}
      counts={vm?.counts ?? { total: 0, overdue: 0, pilots: 0 }}
      notice={notice}
      busy={remind.isPending}
      onWindow={setWindow}
      onRemind={(keys) => remind.mutate({ keys })}
      onOpen={(href) => router.push(href)}
      onDownload={() => void dl.run('compliance', {})}
      onDismissNotice={() => setNotice(null)}
      onRetry={() => void q.refetch()}
    />
  );
}

// ---------------------------------------------------------------- reports

export function PlatformReportsContainer() {
  return (
    <PlatformGate>
      <Reports />
    </PlatformGate>
  );
}

function Reports() {
  const { range, period, onPreset, onCustom } = usePeriod();
  const dl = useDownloader();
  return (
    <PlatformReportsScreen
      period={period}
      presets={PLATFORM_PERIOD_PRESETS}
      datasets={platformDatasets()}
      downloading={dl.downloading}
      error={dl.error}
      onPreset={onPreset}
      onCustom={onCustom}
      onDownload={(dataset) => void dl.run(dataset, range)}
      onDismissError={() => dl.setError(null)}
    />
  );
}

// ---------------------------------------------------------------- announcements

export function PlatformAnnouncementsContainer() {
  return (
    <PlatformGate>
      <Announcements />
    </PlatformGate>
  );
}

function Announcements() {
  const qc = useQueryClient();
  const [formKey, setFormKey] = useState(0);
  const q = useQuery({ queryKey: pk.announcements, queryFn: async () => unwrap(await api.GET('/api/v1/platform/announcements')) });
  const push = useQuery({ queryKey: ['push-config'], queryFn: async () => unwrap(await api.GET('/api/v1/push/config')), staleTime: Infinity });
  const done = () => {
    void qc.invalidateQueries({ queryKey: pk.announcements });
    void qc.invalidateQueries({ queryKey: pk.activity });
    void qc.invalidateQueries({ queryKey: ['announcements'] });
  };
  const post = useMutation({
    mutationFn: async (d: AnnouncementDraft) =>
      unwrap(
        await api.POST('/api/v1/platform/announcements', {
          body: { title: d.title.trim(), body: d.body.trim(), audience: d.audience, level: d.important ? 'important' : 'info', endsAt: announcementEndsAt(d.endsOn), email: d.email, push: d.push },
        }),
      ),
    onSuccess: () => {
      setFormKey((k) => k + 1);
      done();
    },
  });
  const end = useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST('/api/v1/platform/announcements/{announcementId}/end', { params: { path: { announcementId: id } } })),
    onSettled: done,
  });
  const now = new Date();
  return (
    <PlatformAnnouncementsScreen
      state={q.data ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error ?? end.error, 'announcements')}
      announcements={(q.data?.announcements ?? []).map((a) => announcementVM(a, now))}
      audienceOptions={ANNOUNCEMENT_AUDIENCES}
      pushAvailable={!!push.data?.publicKey}
      posting={post.isPending}
      postError={post.error ? (errorText(post.error, 'that') ?? 'Posting failed.') : null}
      formKey={formKey}
      onPost={(d) => post.mutate(d)}
      onEnd={(id) => end.mutate(id)}
      onRetry={() => void q.refetch()}
    />
  );
}

// ---------------------------------------------------------------- activity

export function PlatformActivityContainer() {
  return (
    <PlatformGate>
      <Activity />
    </PlatformGate>
  );
}

function Activity() {
  const q = useQuery({ queryKey: pk.activity, queryFn: async () => unwrap(await api.GET('/api/v1/platform/activity')) });
  return (
    <PlatformActivityScreen
      state={q.data ? 'ready' : q.isError ? 'error' : 'loading'}
      error={errorText(q.error, 'admin activity')}
      events={q.data ? buildPlatformActivity(q.data, new Date()) : []}
      onRetry={() => void q.refetch()}
    />
  );
}
