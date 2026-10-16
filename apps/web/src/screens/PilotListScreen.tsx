'use client';

import type { PilotListScreenProps, PilotRowViewModel } from '@certa/contract';
import { Download, UserPlus, Users } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { LEVEL_RANK, SearchBox, When } from './_parts';

const COLUMNS: Column<PilotRowViewModel>[] = [
  { key: 'name', header: 'Pilot', sort: (p) => p.name.toLowerCase(), render: (p) => <span className="font-semibold">{p.name}</span> },
  { key: 'cert', header: 'Certificate', hideBelow: 'md', sort: (p) => p.certificateNumber, render: (p) => (p.certificateNumber ? <span className="tabular">{p.certificateNumber}</span> : <span className="text-[var(--certa-muted)]">Not on file</span>) },
  { key: 'time', header: 'Flight time', align: 'right', hideBelow: 'sm', sort: (p) => p.totalFlightTime.value, render: (p) => p.totalFlightTime.display },
  { key: 'last', header: 'Last flight', hideBelow: 'lg', sort: (p) => p.lastFlight?.iso ?? null, render: (p) => <span className="text-[var(--certa-muted)]"><When d={p.lastFlight} /></span> },
  { key: 'status', header: 'Status', sort: (p) => LEVEL_RANK[p.status.level], render: (p) => <StatusBadge status={p.status} size="sm" /> },
];

export function PilotListScreen(props: PilotListScreenProps) {
  const searching = props.search.trim().length > 0;
  return (
    <div>
      <PageHeader
        title="Pilots"
        description="Certificates, recurrent training, and flight time for everyone who flies for you."
        actions={props.canManage && <Button arrow icon={<UserPlus className="size-4" aria-hidden />} onClick={props.onAddPilot}>Add pilot</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.pilots.length ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : !props.pilots.length && !searching ? (
        <EmptyState empty={props.empty} icon={<Users className="size-7" aria-hidden />} onAction={props.canManage ? props.onAddPilot : undefined} />
      ) : (
        <DataTable
          id="pilots"
          label="Pilots"
          rows={props.pilots}
          rowKey={(p) => p.id}
          columns={COLUMNS}
          defaultSort={{ key: 'status', dir: 'desc' }}
          onOpen={(p) => props.onOpenPilot(p.id)}
          openLabel={(p) => `Open ${p.name}`}
          toolbar={<SearchBox value={props.search} onChange={props.onSearch} label="Search pilots" placeholder="Name, certificate, email" />}
          bulkActions={[{ label: 'Export credentials', icon: <Download className="size-4" aria-hidden />, onRun: props.onExport }]}
          empty={<>No pilots match “{props.search}”.</>}
        />
      )}
    </div>
  );
}
