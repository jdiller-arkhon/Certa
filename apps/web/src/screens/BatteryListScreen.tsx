'use client';

import type { BatteryListScreenProps } from '@certa/contract';
import { Archive, BatteryMedium, Download, Plus } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LEVEL_COLOR, StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { LEVEL_RANK, When, num } from './_parts';

const BLANK = { serialNumber: '', label: '', aircraftModel: '', cellCount: '', ratedCapacityMah: '', maxCycles: '' };

export function BatteryListScreen(props: BatteryListScreenProps) {
  const [open, setOpen] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [f, setF] = useState(BLANK);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const add = () => {
    props.onAddBattery();
    setOpen(true);
  };
  const retiringBattery = props.batteries.find((b) => b.id === retiring);

  return (
    <div>
      <PageHeader
        title="Batteries"
        description="Cycle counts update automatically from your flights. Certa warns at 90% of the retirement limit."
        actions={props.canManage && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={add}>Add battery</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.batteries.length ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : !props.batteries.length ? (
        <EmptyState empty={props.empty} icon={<BatteryMedium className="size-7" aria-hidden />} onAction={props.canManage ? add : undefined} />
      ) : (
        <DataTable
          id="batteries"
          label="Batteries"
          rows={props.batteries}
          rowKey={(b) => b.id}
          defaultSort={{ key: 'cycles', dir: 'desc' }}
          columns={[
            { key: 'label', header: 'Battery', sort: (b) => b.label.toLowerCase(), render: (b) => <span><span className="block font-semibold">{b.label}</span><span className="tabular block text-[13px] text-[var(--certa-muted)]">S/N {b.serialNumber}</span></span> },
            { key: 'last', header: 'Last used', hideBelow: 'md', sort: (b) => b.lastUsed?.iso ?? null, render: (b) => <span className="text-[var(--certa-muted)]"><When d={b.lastUsed} /></span> },
            {
              key: 'cycles',
              header: 'Cycles',
              sort: (b) => (b.cycleLimit ? b.cycleCount / b.cycleLimit : b.cycleCount / 1000),
              render: (b) => {
                const pct = b.cycleLimit ? Math.min(1, b.cycleCount / b.cycleLimit) : null;
                return (
                  <span className="flex w-40 flex-col gap-1.5">
                    <span className="tabular text-[13px] font-semibold">
                      {b.cycleCount}
                      {b.cycleLimit && <span className="font-normal text-[var(--certa-muted)]"> / {b.cycleLimit} cycles</span>}
                    </span>
                    {pct !== null && (
                      <span className="h-1.5 overflow-hidden rounded-full bg-[var(--certa-inset)]" role="meter" aria-valuemin={0} aria-valuemax={b.cycleLimit!} aria-valuenow={b.cycleCount} aria-label={`${b.label} cycles`}>
                        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct * 100}%`, background: LEVEL_COLOR[b.status.level] }} />
                      </span>
                    )}
                  </span>
                );
              },
            },
            { key: 'status', header: 'Status', sort: (b) => LEVEL_RANK[b.status.level], render: (b) => <StatusBadge status={b.status} size="sm" /> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (b) =>
                props.canManage && b.status.label !== 'Retired' ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" aria-label={`Retire ${b.label}`} icon={<Archive className="size-4" aria-hidden />} onClick={() => setRetiring(b.id)} />
                  </span>
                ) : null,
            },
          ]}
          bulkActions={[
            ...(props.canManage ? [{ label: 'Retire', tone: 'danger' as const, icon: <Archive className="size-4" aria-hidden />, onRun: props.onRetireMany }] : []),
            { label: 'Export', icon: <Download className="size-4" aria-hidden />, onRun: props.onExport },
          ]}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add battery"
        description="Cycles count from flights that list this battery."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="battery-form" arrow loading={props.saving}>Add battery</Button>
          </>
        }
      >
        <form
          id="battery-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onCreateBattery({
              serialNumber: f.serialNumber.trim(),
              label: f.label.trim() || null,
              aircraftModel: f.aircraftModel || null,
              cellCount: num(f.cellCount),
              ratedCapacityMah: num(f.ratedCapacityMah),
              maxCycles: num(f.maxCycles),
            });
            setOpen(false);
            setF(BLANK);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Serial number" error={props.fieldErrors.serialNumber}>{(a) => <Input {...a} required className="tabular" value={f.serialNumber} onChange={set('serialNumber')} />}</Field>
            <Field label="Label" hint="e.g. “M30 #3”">{(a) => <Input {...a} value={f.label} onChange={set('label')} />}</Field>
          </div>
          <Field label="Fits">
            {(a) => (
              <Select {...a} value={f.aircraftModel} onChange={set('aircraftModel')}>
                <option value="">Any aircraft</option>
                {props.aircraftModelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cells">{(a) => <Input {...a} inputMode="numeric" value={f.cellCount} onChange={set('cellCount')} />}</Field>
            <Field label="Capacity">{(a) => <Input {...a} inputMode="numeric" suffix="mAh" value={f.ratedCapacityMah} onChange={set('ratedCapacityMah')} />}</Field>
            <Field label="Retire at">{(a) => <Input {...a} inputMode="numeric" suffix="cyc" placeholder="200" value={f.maxCycles} onChange={set('maxCycles')} />}</Field>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!retiringBattery}
        onClose={() => setRetiring(null)}
        title={`Retire ${retiringBattery?.label ?? ''}?`}
        description="It stays in past flight records but can’t be selected for new flights."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetiring(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (retiring && props.onRetireBattery(retiring), setRetiring(null))}>Retire battery</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]">{retiringBattery && `${retiringBattery.cycleCount} cycles logged.`}</p>
      </Dialog>
    </div>
  );
}
