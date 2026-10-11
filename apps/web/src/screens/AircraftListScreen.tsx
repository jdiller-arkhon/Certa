'use client';

import type { AircraftListScreenProps } from '@certa/contract';
import { Plane, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { ListCard, RowButton, RowMetric, RowTitle, SearchBox, Toolbar } from './_parts';

const FILTERS: { value: AircraftListScreenProps['statusFilter']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'grounded', label: 'Grounded' },
  { value: 'retired', label: 'Retired' },
];

export function AircraftListScreen(props: AircraftListScreenProps) {
  const filtering = props.search.trim().length > 0 || props.statusFilter !== 'all';
  return (
    <div>
      <PageHeader
        eyebrow="Fleet"
        title="Aircraft"
        description="Registration, Remote ID, flight hours, and maintenance for every aircraft."
        actions={props.canManage && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={props.onAddAircraft}>Add aircraft</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.aircraft.length ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : !props.aircraft.length && !filtering ? (
        <EmptyState empty={props.empty} icon={<Plane className="size-7" aria-hidden />} onAction={props.canManage ? props.onAddAircraft : undefined} />
      ) : (
        <>
          <Toolbar>
            <SearchBox value={props.search} onChange={props.onSearch} label="Search aircraft" placeholder="Name, model, serial, registration" />
            <Segmented label="Status" value={props.statusFilter} options={FILTERS} onChange={props.onStatusFilter} className="self-start overflow-x-auto" />
          </Toolbar>
          {props.aircraft.length ? (
            <ListCard>
              {props.aircraft.map((a) => (
                <RowButton key={a.id} onClick={() => props.onOpenAircraft(a.id)} label={`Open ${a.name}`}>
                  <RowTitle title={a.name} sub={[a.name !== a.makeModel && a.makeModel, a.registrationNumber ?? 'Unregistered', `S/N ${a.serialNumber}`].filter(Boolean).join(' · ')} />
                  <span className="flex items-center gap-6">
                    <RowMetric label="Flight time" value={a.totalFlightTime.display} />
                    <RowMetric label="Flights" value={a.totalFlights} className="hidden md:flex" />
                    <StatusBadge status={a.status} size="sm" />
                  </span>
                </RowButton>
              ))}
            </ListCard>
          ) : (
            <p className="py-10 text-center text-[15px] text-[var(--certa-muted)]">No aircraft match these filters.</p>
          )}
        </>
      )}
    </div>
  );
}
