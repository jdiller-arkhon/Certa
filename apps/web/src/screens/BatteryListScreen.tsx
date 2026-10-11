'use client';

import type { BatteryListScreenProps } from '@certa/contract';
import { Archive, BatteryMedium, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LEVEL_COLOR, StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { ListCard, RowButton, RowMetric, RowTitle, When, num } from './_parts';

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
        eyebrow="Fleet"
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
        <ListCard>
          {props.batteries.map((b) => {
            const pct = b.cycleLimit ? Math.min(1, b.cycleCount / b.cycleLimit) : null;
            return (
              <RowButton key={b.id}>
                <RowTitle title={b.label} sub={<>S/N <span className="tabular">{b.serialNumber}</span> · last used <When d={b.lastUsed} /></>} />
                <span className="flex items-center gap-5">
                  <span className="flex w-36 flex-col gap-1.5">
                    <span className="tabular text-right text-[13px] font-semibold">
                      {b.cycleCount}
                      {b.cycleLimit && <span className="font-normal text-[var(--certa-muted)]"> / {b.cycleLimit} cycles</span>}
                    </span>
                    {pct !== null && (
                      <span className="h-1.5 overflow-hidden rounded-full bg-[var(--certa-inset)]" role="meter" aria-valuemin={0} aria-valuemax={b.cycleLimit!} aria-valuenow={b.cycleCount} aria-label={`${b.label} cycles`}>
                        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct * 100}%`, background: LEVEL_COLOR[b.status.level] }} />
                      </span>
                    )}
                  </span>
                  <StatusBadge status={b.status} size="sm" />
                  {props.canManage && b.status.label !== 'Retired' && (
                    <Button size="sm" variant="ghost" aria-label={`Retire ${b.label}`} icon={<Archive className="size-4" aria-hidden />} onClick={() => setRetiring(b.id)} />
                  )}
                </span>
              </RowButton>
            );
          })}
        </ListCard>
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
