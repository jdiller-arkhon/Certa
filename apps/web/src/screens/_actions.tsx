'use client';

import type { ActionFixInput, ActionQueueItem } from '@certa/contract';
import { CheckCircle2, ChevronRight, Plane, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/components/cn';
import { EASE } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { LEVEL_COLOR, LevelIcon } from '@/components/ui/status';

const today = () => new Date().toISOString().slice(0, 10);
type Values = ActionFixInput['values'];

/** The inline form for one fix kind. Returns null for "open" fixes (they just navigate). */
function FixForm({ item, busy, onSubmit, onCancel }: { item: ActionQueueItem; busy: boolean; onSubmit: (v: Values) => void; onCancel: () => void }) {
  const f = item.fix;
  const initial: Values =
    f.kind === 'renew_registration'
      ? { registrationNumber: f.registrationNumber ?? '', expiresOn: '' }
      : f.kind === 'log_maintenance'
        ? { performedOn: today(), performedBy: '' }
        : f.kind === 'set_remote_id'
          ? { remoteIdMethod: 'standard', remoteIdSerial: '' }
          : f.kind === 'renew_credential' || f.kind === 'add_credential'
            ? { issuedOn: today(), expiresOn: '', identifier: '' }
            : f.kind === 'renew_insurance'
              ? { expiresOn: '' }
              : { reason: '' };
  const [v, setV] = useState<Values>(initial);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const id = `fix-${item.id.replace(/[^a-z0-9]/gi, '-')}`;

  let fields: React.ReactNode = null;
  let hint = '';
  switch (f.kind) {
    case 'renew_credential':
    case 'add_credential':
      hint = f.kind === 'renew_credential' ? `Record the new ${f.typeLabel}. The old one stays in the history.` : `Add ${f.typeLabel} to compute currency.`;
      fields = (
        <>
          <Field label="Issued">{(a) => <Input {...a} type="date" required max={today()} value={v.issuedOn} onChange={set('issuedOn')} />}</Field>
          {f.expires && <Field label="Expires" hint="Blank = computed from the rule pack">{(a) => <Input {...a} type="date" min={v.issuedOn} value={v.expiresOn} onChange={set('expiresOn')} />}</Field>}
          <Field label="Number" hint="Optional">{(a) => <Input {...a} className="tabular" value={v.identifier} onChange={set('identifier')} />}</Field>
        </>
      );
      break;
    case 'renew_registration':
      hint = 'From the FAA DroneZone registration certificate.';
      fields = (
        <>
          <Field label="Registration number">{(a) => <Input {...a} required className="tabular" placeholder="FA3…" value={v.registrationNumber} onChange={set('registrationNumber')} />}</Field>
          <Field label="Expires">{(a) => <Input {...a} type="date" required min={today()} value={v.expiresOn} onChange={set('expiresOn')} />}</Field>
        </>
      );
      break;
    case 'set_remote_id':
      hint = 'How the aircraft broadcasts Remote ID.';
      fields = (
        <>
          <Field label="Method">
            {(a) => (
              <Select {...a} value={v.remoteIdMethod} onChange={set('remoteIdMethod')}>
                <option value="standard">Standard Remote ID</option>
                <option value="broadcast_module">Broadcast module</option>
                <option value="fria">FRIA only</option>
              </Select>
            )}
          </Field>
          {v.remoteIdMethod !== 'fria' && <Field label="Serial" hint="Optional">{(a) => <Input {...a} className="tabular" value={v.remoteIdSerial} onChange={set('remoteIdSerial')} />}</Field>}
        </>
      );
      break;
    case 'log_maintenance':
      hint = `Marks “${f.scheduleName}” done and restarts its interval.`;
      fields = (
        <>
          <Field label="Date">{(a) => <Input {...a} type="date" required max={today()} value={v.performedOn} onChange={set('performedOn')} />}</Field>
          <Field label="Performed by">{(a) => <Input {...a} required autoComplete="name" value={v.performedBy} onChange={set('performedBy')} />}</Field>
        </>
      );
      break;
    case 'renew_insurance':
      hint = `Extends the ${f.carrier} policy. Current expiry ${f.expiresOn}.`;
      fields = <Field label="New expiry date">{(a) => <Input {...a} type="date" required min={f.expiresOn} value={v.expiresOn} onChange={set('expiresOn')} />}</Field>;
      break;
    case 'return_to_service':
      hint = 'Recorded as unscheduled maintenance.';
      fields = <Field label="Work performed" className="sm:col-span-2">{(a) => <Input {...a} required minLength={3} value={v.reason} onChange={set('reason')} />}</Field>;
      break;
    case 'open':
      return null;
  }

  return (
    <motion.form
      id={id}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1, transition: { duration: 0.3, ease: EASE } }}
      exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
      className="overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="border-t border-dashed border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-inset)_55%,var(--certa-surface))] px-5 py-4">
        <p className="mb-3 text-[13px] text-[var(--certa-muted)]">{hint}</p>
        <div className="grid gap-3 sm:grid-cols-3">{fields}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" type="submit" loading={busy}>Save</Button>
        </div>
      </div>
    </motion.form>
  );
}

export function ActionQueue({ items, fixing, canFix, onFix, onOpen }: { items: ActionQueueItem[]; fixing: string[]; canFix: boolean; onFix: (input: ActionFixInput) => void; onOpen: (href: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const red = items.filter((i) => i.level === 'red').length;
  const visible = showAll ? items : items.slice(0, 8);

  return (
    <Panel
      id="action-queue"
      label="Action queue"
      meta={
        items.length ? (
          <>
            {red > 0 && <span style={{ color: LEVEL_COLOR.red }}>{red} blocking</span>}
            <span>{items.length} total</span>
          </>
        ) : (
          <span style={{ color: LEVEL_COLOR.green }}>Clear</span>
        )
      }
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-[14px]">
          <CheckCircle2 aria-hidden className="size-5" style={{ color: LEVEL_COLOR.green }} />
          <span>
            Nothing to fix. <span className="text-[var(--certa-muted)]">Every certificate, registration, inspection, and policy on file is current.</span>
          </span>
        </div>
      ) : (
        <ul>
          {visible.map((it) => {
            const expanded = open === it.id;
            const busy = fixing.includes(it.id);
            const Icon = it.subjectKind === 'pilot' ? Users : Plane;
            return (
              <li key={it.id} className="border-b border-[var(--certa-border)] last:border-b-0">
                <div className={cn('flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4', expanded && 'bg-[var(--certa-inset)]/40')}>
                  <span className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-[3px]" style={{ color: LEVEL_COLOR[it.level] }}><LevelIcon level={it.level} /></span>
                    <span className="min-w-0">
                      <button type="button" onClick={() => onOpen(it.href)} className="group inline-flex items-center gap-1.5 text-[15px] font-semibold hover:underline">
                        <Icon aria-hidden className="size-3.5 text-[var(--certa-muted)]" />
                        {it.subject}
                      </button>
                      <span className="block text-[14px] text-[var(--certa-muted)]">
                        {it.problem}
                        {it.due && <span className="tabular"> · {it.due.display}</span>}
                      </span>
                    </span>
                  </span>
                  {canFix && it.fix.kind !== 'open' ? (
                    <Button
                      size="sm"
                      variant={expanded ? 'ghost' : it.level === 'red' ? 'primary' : 'secondary'}
                      aria-expanded={expanded}
                      aria-controls={`fix-${it.id.replace(/[^a-z0-9]/gi, '-')}`}
                      loading={busy}
                      onClick={() => setOpen(expanded ? null : it.id)}
                      className="self-start sm:self-auto"
                    >
                      {expanded ? 'Close' : it.actionLabel}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onOpen(it.href)} icon={<ChevronRight className="size-4" aria-hidden />} className="self-start sm:self-auto">
                      Open
                    </Button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <FixForm
                      key="form"
                      item={it}
                      busy={busy}
                      onCancel={() => setOpen(null)}
                      onSubmit={(values) => {
                        onFix({ itemId: it.id, fix: it.fix, values });
                        setOpen(null);
                      }}
                    />
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 8 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="w-full border-t border-[var(--certa-border)] py-3 text-[13px] font-semibold text-[var(--certa-muted)] hover:text-[var(--certa-text)]">
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Panel>
  );
}
