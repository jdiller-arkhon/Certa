'use client';

import type { PlatformPilotRowVM, PlatformPilotsScreenProps } from '@certa/contract';
import { Download, Mail } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, SkeletonRows } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { LEVEL_COLOR, StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { FlagChip, Tag } from './_platform';
import { LEVEL_RANK, SearchBox } from './_parts';

const COLUMNS: Column<PlatformPilotRowVM>[] = [
  {
    key: 'name',
    header: 'Pilot',
    sort: (p) => p.name.toLowerCase(),
    render: (p) => (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar user={{ initials: p.initials, name: p.name }} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block truncate text-[12.5px] text-[var(--certa-muted)]">
            {p.orgName}
            {p.roleLabel ? ` · ${p.roleLabel}` : ''}
          </span>
        </span>
      </span>
    ),
  },
  {
    key: 'help',
    header: 'Needs a hand',
    sort: (p) => p.helpSort,
    render: (p) =>
      p.helpFlags.length ? (
        <span className="flex flex-wrap gap-1">
          <FlagChip flag={p.helpFlags[0]!} size="sm" />
          {p.helpFlags.length > 1 && <span className="self-center text-[12px] text-[var(--certa-muted)]" title={p.helpFlags.slice(1).map((f) => f.label).join(', ')}>+{p.helpFlags.length - 1} more</span>}
        </span>
      ) : (
        <span className="text-[13px] text-[var(--certa-muted)]">—</span>
      ),
  },
  {
    key: 'recurrent',
    header: 'Recurrent due',
    hideBelow: 'md',
    sort: (p) => p.recurrent.sort,
    render: (p) => <span className="tabular text-[13.5px]" style={p.recurrent.level && p.recurrent.level !== 'green' ? { color: LEVEL_COLOR[p.recurrent.level] } : undefined}>{p.recurrent.text}</span>,
  },
  { key: 'hours', header: 'Hours', align: 'right', hideBelow: 'sm', sort: (p) => p.hoursSort, render: (p) => <span className="tabular">{p.hours}</span> },
  { key: 'last', header: 'Last flight', hideBelow: 'lg', sort: (p) => p.lastFlight.sort, render: (p) => <span className="text-[13.5px] text-[var(--certa-muted)]">{p.lastFlight.text}</span> },
  {
    key: 'account',
    header: 'Account',
    hideBelow: 'lg',
    sort: (p) => p.account.label,
    render: (p) => (
      <span className="flex flex-wrap items-center gap-1">
        <span className="text-[13px]" style={p.account.level ? { color: LEVEL_COLOR[p.account.level] } : undefined}>{p.account.label}</span>
        {p.arkhonLinked && <Tag>Arkhon</Tag>}
        {p.discordLinked && <Tag>Discord</Tag>}
      </span>
    ),
  },
  { key: 'status', header: 'Status', sort: (p) => LEVEL_RANK[p.status.level], render: (p) => <StatusBadge status={p.status} size="sm" /> },
];

export function PlatformPilotsScreen(props: PlatformPilotsScreenProps) {
  const f = props.filter;
  const view = f.flag === 'any' ? 'help' : 'all';
  return (
    <div>
      <PageHeader
        eyebrow="Arkhon platform console"
        title="All pilots"
        description="Every pilot in every organization. Select pilots to email each of them exactly what needs fixing in their records."
        actions={<Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={props.onDownload}>Download CSV</Button>}
      />
      <Banners>
        {props.error && <Banner key="e" tone="error" onRetry={props.onRetry}>{props.error}</Banner>}
        {props.notice && <Banner key="n" tone={props.notice.tone} onDismiss={props.onDismissNotice}>{props.notice.text}</Banner>}
      </Banners>
      {props.state === 'loading' ? (
        <Card className="p-6"><SkeletonRows rows={6} /></Card>
      ) : props.state === 'ready' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<'help' | 'all'>
              label="Which pilots"
              value={view}
              options={[
                { value: 'help', label: 'Needs a hand', count: props.needHelpCount },
                { value: 'all', label: 'Everyone', count: props.totalCount },
              ]}
              onChange={(v) => props.onFilter({ ...f, flag: v === 'help' ? 'any' : 'all' })}
            />
            {props.flagOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by what they need">
                {props.flagOptions.map((o) => {
                  const on = f.flag === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => props.onFilter({ ...f, flag: on ? 'any' : o.id })}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors"
                      style={on ? { borderColor: LEVEL_COLOR[o.level], background: `color-mix(in srgb, ${LEVEL_COLOR[o.level]} 10%, var(--certa-surface))` } : { borderColor: 'var(--certa-border)' }}
                    >
                      <span aria-hidden className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[o.level] }} />
                      {o.label}
                      <span className="tabular text-[var(--certa-muted)]">{o.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DataTable
            id="platform-pilots"
            label={view === 'help' ? 'Pilots who need a hand' : 'All pilots'}
            meta={<span className="tabular">{props.rows.length} shown</span>}
            rows={props.rows}
            rowKey={(p) => p.key}
            columns={COLUMNS}
            defaultSort={{ key: 'help', dir: 'asc' }}
            onOpen={props.onOpen}
            openLabel={(p) => `Open ${p.name}`}
            toolbar={
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <SearchBox value={f.query} onChange={(query) => props.onFilter({ ...f, query })} label="Search pilots" placeholder="Name, email, organization" />
                <label className="sm:w-56">
                  <span className="sr-only">Organization</span>
                  <Select value={f.orgId} onChange={(e) => props.onFilter({ ...f, orgId: e.target.value })} className="h-10 text-[14px]">
                    <option value="">All organizations</option>
                    {props.orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </label>
                <label className="sm:w-44">
                  <span className="sr-only">Readiness</span>
                  <Select value={f.level} onChange={(e) => props.onFilter({ ...f, level: e.target.value as typeof f.level })} className="h-10 text-[14px]">
                    <option value="all">Any readiness</option>
                    <option value="red">Not cleared</option>
                    <option value="amber">Attention</option>
                    <option value="green">Cleared</option>
                  </Select>
                </label>
              </div>
            }
            bulkActions={[{ label: props.busy ? 'Sending…' : 'Email reminders', icon: <Mail className="size-4" aria-hidden />, onRun: props.onRemind }]}
            empty={view === 'help' && !f.query && !f.orgId && f.level === 'all' ? <>Nobody needs a hand right now.</> : <>No pilots match these filters.</>}
          />
        </div>
      ) : null}
    </div>
  );
}
