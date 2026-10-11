'use client';

import type { InsuranceScreenProps } from '@certa/contract';
import { Plus, Trash2, Umbrella } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { Facts, TextArea, When, num } from './_parts';

const BLANK = { carrier: '', policyNumber: '', coverageSummary: '', liability: '', effectiveOn: '', expiresOn: '', aircraft: [] as string[] };

export function InsuranceScreen(props: InsuranceScreenProps) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [f, setF] = useState(BLANK);
  const toggle = (id: string) => setF({ ...f, aircraft: f.aircraft.includes(id) ? f.aircraft.filter((x) => x !== id) : [...f.aircraft, id] });

  return (
    <div>
      <PageHeader
        eyebrow="Fleet"
        title="Insurance"
        description="Liability and hull policies, linked to the aircraft they cover. Certa warns 30 days before a policy lapses."
        actions={props.canManage && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Add policy</Button>}
      />
      <Banners>
        {props.error && <Banner key="e" tone="error">{props.error}</Banner>}
        {props.policies.length > 0 && props.uncoveredAircraft.length > 0 && (
          <Banner key="u" tone="warning">
            Not covered by a policy in force: {props.uncoveredAircraft.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={() => props.onOpenAircraft(a.id)}>{a.name}</button>
              </span>
            ))}
          </Banner>
        )}
      </Banners>

      {props.loading && !props.policies.length ? (
        <Card className="p-6"><SkeletonRows rows={3} /></Card>
      ) : !props.policies.length ? (
        <EmptyState empty={props.empty} icon={<Umbrella className="size-7" aria-hidden />} onAction={props.canManage ? () => setOpen(true) : undefined} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {props.policies.map((p) => (
            <Card key={p.id} className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-semibold">{p.carrier}</h2>
                  <div className="tabular text-[13px] text-[var(--certa-muted)]">Policy {p.policyNumber}</div>
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge status={p.status} size="sm" />
                  {props.canManage && <Button size="sm" variant="ghost" aria-label={`Remove policy ${p.policyNumber}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setRemoving(p.id)} />}
                </div>
              </div>
              <Facts items={[['Effective', <When d={p.effective} />], ['Expires', <When d={p.expires} />], ['Liability limit', p.liabilityLimit], ['Coverage', p.coverageSummary]]} />
              <div className="mt-5">
                <div className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">Covers {p.coveredAircraft.length} aircraft</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.coveredAircraft.map((a) => (
                    <button key={a.id} type="button" onClick={() => props.onOpenAircraft(a.id)} className="rounded-full border border-[var(--certa-border)] px-2.5 py-1 text-[13px] font-semibold hover:bg-[var(--certa-inset)]">{a.name}</button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add insurance policy"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="policy-form" arrow loading={props.saving}>Add policy</Button>
          </>
        }
      >
        <form
          id="policy-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onAddPolicy({ carrier: f.carrier.trim(), policyNumber: f.policyNumber.trim(), coverageSummary: f.coverageSummary.trim() || null, liabilityLimitDollars: num(f.liability.replace(/[$,]/g, '')), effectiveOn: f.effectiveOn, expiresOn: f.expiresOn, coveredAircraftIds: f.aircraft });
            setOpen(false);
            setF(BLANK);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Carrier">{(a) => <Input {...a} required value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} />}</Field>
            <Field label="Policy number">{(a) => <Input {...a} required className="tabular" value={f.policyNumber} onChange={(e) => setF({ ...f, policyNumber: e.target.value })} />}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Effective">{(a) => <Input {...a} type="date" required value={f.effectiveOn} onChange={(e) => setF({ ...f, effectiveOn: e.target.value })} />}</Field>
            <Field label="Expires">{(a) => <Input {...a} type="date" required min={f.effectiveOn || undefined} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} />}</Field>
            <Field label="Liability limit">{(a) => <Input {...a} inputMode="numeric" placeholder="1,000,000" suffix="USD" value={f.liability} onChange={(e) => setF({ ...f, liability: e.target.value })} />}</Field>
          </div>
          <Field label="Coverage" hint="Optional">{(a) => <TextArea {...a} className="min-h-16" value={f.coverageSummary} onChange={(e) => setF({ ...f, coverageSummary: e.target.value })} />}</Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Covered aircraft</legend>
            <div className="flex flex-wrap gap-2">
              {props.aircraftOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={f.aircraft.includes(o.value)}
                  onClick={() => toggle(o.value)}
                  className={cn('h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors', f.aircraft.includes(o.value) ? 'border-[var(--certa-action)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] hover:bg-[var(--certa-inset)]')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      </Dialog>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this policy?"
        description="Covered aircraft will show as uninsured unless another policy covers them."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (removing && props.onRemovePolicy(removing), setRemoving(null))}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]">{props.policies.find((p) => p.id === removing)?.carrier}</p>
      </Dialog>
    </div>
  );
}
