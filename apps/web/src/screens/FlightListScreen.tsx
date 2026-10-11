'use client';

import type { FlightListScreenProps } from '@certa/contract';
import { Plus, Route, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';
import { FlightRows, ListCard, Stat } from './_parts';

export function FlightListScreen(props: FlightListScreenProps) {
  const f = props.filter;
  const filtering = !!(f.pilotId || f.aircraftId || f.from || f.to);
  const set = (patch: Partial<typeof f>) => props.onFilterChange({ ...f, ...patch });
  const items = props.flights.items;
  return (
    <div>
      <PageHeader
        eyebrow="Logbook"
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
          {items.length ? (
            <>
              <ListCard>
                <FlightRows flights={items} onOpen={props.onOpenFlight} />
              </ListCard>
              <div className="mt-5 flex flex-col items-center gap-2 text-[13px] text-[var(--certa-muted)]">
                <span className="tabular">Showing {items.length} of {props.flights.total}</span>
                {props.flights.nextCursor && <Button variant="secondary" loading={props.loading} onClick={props.onLoadMore}>Load more</Button>}
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-[15px] text-[var(--certa-muted)]">
              No flights match these filters.{' '}
              <button type="button" className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline" onClick={() => props.onFilterChange({ pilotId: null, aircraftId: null, from: null, to: null })}>Clear filters</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
