'use client';

import type { FlightListScreenProps } from '@certa/contract';
import { Download, Plus, Route, Upload } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';
import { PendingSync, Stat, When } from './_parts';

export function FlightListScreen(props: FlightListScreenProps) {
  const f = props.filter;
  const filtering = !!(f.pilotId || f.aircraftId || f.from || f.to);
  const set = (patch: Partial<typeof f>) => props.onFilterChange({ ...f, ...patch });
  const items = props.flights.items;
  return (
    <div>
      <PageHeader
        title="Flights"
        description="Every flight, with pilot, aircraft, batteries, and conditions. Records are tamper-evident."
        actions={
          props.canLog && (
            <>
              <Button variant="secondary" icon={<Upload className="size-4" aria-hidden />} onClick={props.onImport}>Import</Button>
              <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={props.onLogFlight}>Log flight</Button>
            </>
          )
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !items.length ? (
        <Card className="p-6"><SkeletonRows rows={6} /></Card>
      ) : !items.length && !filtering ? (
        <EmptyState empty={props.empty} icon={<Route className="size-7" aria-hidden />} onAction={props.canLog ? props.onLogFlight : undefined} />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select aria-label="Pilot" className="h-11 text-sm" value={f.pilotId ?? ''} onChange={(e) => set({ pilotId: e.target.value || null })}>
              <option value="">All pilots</option>
              {props.pilotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Aircraft" className="h-11 text-sm" value={f.aircraftId ?? ''} onChange={(e) => set({ aircraftId: e.target.value || null })}>
              <option value="">All aircraft</option>
              {props.aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Input aria-label="From date" type="date" className="h-11 text-sm" value={f.from ?? ''} max={f.to ?? undefined} onChange={(e) => set({ from: e.target.value || null })} />
            <Input aria-label="To date" type="date" className="h-11 text-sm" value={f.to ?? ''} min={f.from ?? undefined} onChange={(e) => set({ to: e.target.value || null })} />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
            <Stat label="Flights" value={props.totals.flights} />
            <Stat label="Flight time" value={props.totals.flightTime.display} />
          </div>
          <DataTable
            id="flights"
            label="Flights"
            meta={<span className="tabular">{items.length} of {props.flights.total}</span>}
            rows={items}
            rowKey={(r) => r.id}
            onOpen={(r) => props.onOpenFlight(r.id)}
            openLabel={(r) => `Flight ${r.takeoff.absolute}`}
            columns={[
              {
                key: 'when',
                header: 'Takeoff',
                sort: (r) => r.takeoff.iso,
                render: (r) => (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold"><When d={r.takeoff} /></span>
                    {r.pendingSync ? <PendingSync /> : r.source === 'import' ? <span className="rounded-full bg-[var(--certa-inset)] px-2 py-0.5 text-[11px] font-semibold text-[var(--certa-muted)]">Imported</span> : null}
                  </span>
                ),
              },
              { key: 'pilot', header: 'Pilot', hideBelow: 'md', sort: (r) => r.pilotName, render: (r) => r.pilotName },
              { key: 'aircraft', header: 'Aircraft', hideBelow: 'sm', sort: (r) => r.aircraftName, render: (r) => r.aircraftName },
              { key: 'site', header: 'Location', hideBelow: 'lg', sort: (r) => r.locationName, render: (r) => r.locationName ?? <span className="text-[var(--certa-muted)]">—</span> },
              { key: 'alt', header: 'Max alt', align: 'right', hideBelow: 'lg', sort: (r) => r.maxAltitude?.value ?? null, render: (r) => r.maxAltitude?.display ?? '—' },
              { key: 'dur', header: 'Duration', align: 'right', sort: (r) => r.duration.value, render: (r) => r.duration.display },
            ]}
            bulkActions={[{ label: 'Export CSV', icon: <Download className="size-4" aria-hidden />, onRun: props.onExport }]}
            empty={
              <>
                No flights match these filters.{' '}
                <button type="button" className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline" onClick={() => props.onFilterChange({ pilotId: null, aircraftId: null, from: null, to: null })}>Clear filters</button>
              </>
            }
            footer={
              props.flights.nextCursor ? (
                <div className="flex justify-center border-t border-[var(--certa-border)] py-3">
                  <Button variant="secondary" size="sm" loading={props.loading} onClick={props.onLoadMore}>Load more</Button>
                </div>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}
