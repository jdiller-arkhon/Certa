'use client';

import type { MissionsScreenProps } from '@certa/contract';
import { Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { LEVEL_RANK } from './_parts';

type View = 'open' | 'closed';

export function MissionsScreen(props: MissionsScreenProps) {
  const [view, setView] = useState<View>('open');
  const open = props.missions.filter((m) => m.open);
  const closed = props.missions.filter((m) => !m.open);
  const rows = view === 'open' ? open : closed;
  return (
    <div>
      <PageHeader
        title="Missions"
        description="Plan jobs ahead: crew, aircraft, place, height and authorizations. Certa checks everyone and everything will be legal on the day."
        actions={props.canPlan && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={props.onPlanMission}>Plan mission</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.missions.length ? (
        <Card className="p-6"><SkeletonRows rows={5} /></Card>
      ) : !props.missions.length ? (
        <EmptyState empty={props.empty} icon={<Briefcase className="size-7" aria-hidden />} onAction={props.canPlan ? props.onPlanMission : undefined} />
      ) : (
        <DataTable
          id={`missions-${view}`}
          label={view === 'open' ? 'Upcoming and in progress' : 'Completed and cancelled'}
          toolbar={
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: 'open', label: 'Upcoming', count: open.length },
                { value: 'closed', label: 'Past', count: closed.length },
              ]}
            />
          }
          rows={rows}
          rowKey={(m) => m.id}
          openLabel={(m) => `Open ${m.name}`}
          onOpen={(m) => props.onOpenMission(m.id)}
          empty={view === 'open' ? 'Nothing planned. Plan a mission to see it here.' : 'No completed or cancelled missions yet.'}
          columns={[
            {
              key: 'name',
              header: 'Mission',
              sort: (m) => m.name.toLowerCase(),
              render: (m) => (
                <span className="block min-w-0">
                  <span className="block font-semibold">{m.name}</span>
                  <span className="block text-[13px] text-[var(--certa-muted)]">{m.window ?? 'No date set'}</span>
                </span>
              ),
            },
            { key: 'where', header: 'Where', hideBelow: 'lg', sort: (m) => m.locationName ?? '', render: (m) => m.locationName ?? <span className="text-[var(--certa-muted)]">—</span> },
            {
              key: 'crew',
              header: 'Crew and aircraft',
              hideBelow: 'md',
              render: (m) => (
                <span className="block text-[14px]">
                  {m.pilotInCommand ?? <span className="text-[var(--certa-muted)]">No pilot yet</span>}
                  <span className="block text-[13px] text-[var(--certa-muted)]">{m.aircraft.join(', ') || 'No aircraft yet'}</span>
                </span>
              ),
            },
            { key: 'when', header: 'Starts', hideBelow: 'sm', sort: (m) => m.starts?.iso ?? null, render: (m) => (m.starts ? <span className="text-[14px]">{m.starts.relative}</span> : <span className="text-[var(--certa-muted)]">—</span>) },
            {
              key: 'status',
              header: view === 'open' ? 'Readiness' : 'Status',
              sort: (m) => (m.readiness ? LEVEL_RANK[m.readiness.level] : m.status.label),
              render: (m) => (
                <span className="inline-flex flex-col items-start gap-1">
                  {m.readiness ? <StatusBadge status={m.readiness} size="sm" /> : <StatusBadge status={m.status} size="sm" />}
                  {m.readiness && <span className="text-[12px] text-[var(--certa-muted)]">{m.status.label}{m.flightCount ? ` · ${m.flightCount} ${m.flightCount === 1 ? 'flight' : 'flights'}` : ''}</span>}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
