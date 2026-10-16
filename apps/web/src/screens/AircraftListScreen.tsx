'use client';

import type { AircraftListScreenProps, AircraftRowViewModel } from '@certa/contract';
import { Download, Plane, Plus, Umbrella } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { LEVEL_RANK, SearchBox } from './_parts';

const FILTERS: { value: AircraftListScreenProps['statusFilter']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'grounded', label: 'Grounded' },
  { value: 'retired', label: 'Retired' },
];

const COLUMNS: Column<AircraftRowViewModel>[] = [
  {
    key: 'name',
    header: 'Aircraft',
    sort: (a) => a.name.toLowerCase(),
    render: (a) => (
      <span>
        <span className="block font-semibold">{a.name}</span>
        {a.name !== a.makeModel && <span className="block text-[13px] text-[var(--certa-muted)]">{a.makeModel}</span>}
      </span>
    ),
  },
  { key: 'reg', header: 'Registration', hideBelow: 'md', sort: (a) => a.registrationNumber, render: (a) => (a.registrationNumber ? <span className="tabular">{a.registrationNumber}</span> : <span className="text-[var(--certa-muted)]">Unregistered</span>) },
  { key: 'serial', header: 'Serial', hideBelow: 'lg', sort: (a) => a.serialNumber, render: (a) => <span className="tabular text-[var(--certa-muted)]">{a.serialNumber}</span> },
  { key: 'time', header: 'Flight time', align: 'right', hideBelow: 'sm', sort: (a) => a.totalFlightTime.value, render: (a) => a.totalFlightTime.display },
  { key: 'flights', header: 'Flights', align: 'right', hideBelow: 'md', sort: (a) => a.totalFlights, render: (a) => a.totalFlights },
  { key: 'status', header: 'Status', sort: (a) => LEVEL_RANK[a.status.level], render: (a) => <StatusBadge status={a.status} size="sm" /> },
];

export function AircraftListScreen(props: AircraftListScreenProps) {
  const filtering = props.search.trim().length > 0 || props.statusFilter !== 'all';
  const [policyFor, setPolicyFor] = useState<string[] | null>(null);
  const [policyId, setPolicyId] = useState('');
  return (
    <div>
      <PageHeader
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
        <DataTable
          id="aircraft"
          label="Aircraft"
          rows={props.aircraft}
          rowKey={(a) => a.id}
          columns={COLUMNS}
          defaultSort={{ key: 'status', dir: 'desc' }}
          onOpen={(a) => props.onOpenAircraft(a.id)}
          openLabel={(a) => `Open ${a.name}`}
          toolbar={
            <>
              <SearchBox value={props.search} onChange={props.onSearch} label="Search aircraft" placeholder="Name, model, serial, registration" />
              <Segmented label="Status" value={props.statusFilter} options={FILTERS} onChange={props.onStatusFilter} className="self-start overflow-x-auto" />
            </>
          }
          bulkActions={[
            ...(props.canManage && props.insuranceOptions.length
              ? [{ label: 'Add to policy', icon: <Umbrella className="size-4" aria-hidden />, onRun: (ids: string[]) => (setPolicyId(props.insuranceOptions[0]!.value), setPolicyFor(ids)) }]
              : []),
            { label: 'Export', icon: <Download className="size-4" aria-hidden />, onRun: props.onExport },
          ]}
          empty="No aircraft match these filters."
        />
      )}
      <Dialog
        open={!!policyFor}
        onClose={() => setPolicyFor(null)}
        title={`Add ${policyFor?.length ?? 0} aircraft to a policy`}
        description="They’ll count as insured under it from now on."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPolicyFor(null)}>Cancel</Button>
            <Button onClick={() => (policyFor && props.onAddToPolicy({ policyId, aircraftIds: policyFor }), setPolicyFor(null))}>Add to policy</Button>
          </>
        }
      >
        <Field label="Policy">
          {(a) => (
            <Select {...a} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
              {props.insuranceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </Dialog>
    </div>
  );
}
