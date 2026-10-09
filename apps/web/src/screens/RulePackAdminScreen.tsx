'use client';

import type { RulePackAdminScreenProps, RuleRowViewModel } from '@certa/contract';
import { BadgeCheck, ExternalLink, FileWarning, PencilLine, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { EASE, Rise } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Label, PageHeader } from '@/components/ui/text';

const APPLIES: Record<string, string> = { pilot: 'Pilot', aircraft: 'Aircraft', operation: 'Operation', incident: 'Incident', credential: 'Credential', battery: 'Battery' };

function VerificationMeter({ verified, total }: { verified: number; total: number }) {
  const pct = total ? (verified / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          <span className="tabular">{verified}</span> of <span className="tabular">{total}</span> values verified
        </span>
        <span className="tabular text-[var(--certa-muted)]">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--certa-inset)]">
        <motion.div className="h-full rounded-full bg-[var(--certa-current)]" initial={{ width: 0 }} animate={{ width: `${Math.max(pct, 0)}%` }} transition={{ duration: 1, ease: EASE, delay: 0.3 }} />
      </div>
    </div>
  );
}

function OverrideDialog({ rule, onClose, onSave }: { rule: RuleRowViewModel | null; onClose: () => void; onSave: (value: unknown, reason: string) => void }) {
  const ed = rule?.editor;
  const [value, setValue] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const current = value ?? ed?.value;
  const reset = () => {
    setValue(null);
    setReason('');
  };
  return (
    <Dialog
      open={!!rule}
      onClose={() => (reset(), onClose())}
      title={rule ? `Override: ${rule.title}` : ''}
      description="Applies to your organization only. The pack value is kept and the change is recorded in the audit log with your reason."
      footer={
        <>
          <Button variant="secondary" onClick={() => (reset(), onClose())}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="override-form"
            disabled={reason.trim().length < 3}
          >
            Save override
          </Button>
        </>
      }
    >
      {rule && ed && (
        <form
          id="override-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(current, reason.trim());
            reset();
          }}
        >
          <div className="rounded-2xl bg-[var(--certa-inset)] px-4 py-3 text-sm">
            <span className="text-[var(--certa-muted)]">Pack value:</span> <span className="font-semibold">{rule.packValueDisplay ?? rule.valueDisplay}</span>
            {rule.statedAs && <span className="text-[var(--certa-muted)]"> · stated as “{rule.statedAs}”</span>}
          </div>
          {ed.input === 'number' && (
            <Field label="New value">
              {(a) => (
                <Input {...a} aria-label={`Override value for ${rule.id}`} type="number" step={ed.step} required suffix={ed.unit ?? undefined} value={String(current ?? '')} onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))} />
              )}
            </Field>
          )}
          {ed.input === 'duration' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                {(a) => (
                  <Input {...a} aria-label={`Override value for ${rule.id}`} type="number" min={1} required value={String((current as typeof ed.value).amount)} onChange={(e) => setValue({ ...(current as typeof ed.value), amount: Number(e.target.value) })} />
                )}
              </Field>
              <Field label="Unit">
                {(a) => (
                  <Select {...a} value={(current as typeof ed.value).unit} onChange={(e) => setValue({ ...(current as typeof ed.value), unit: e.target.value })}>
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </Select>
                )}
              </Field>
            </div>
          )}
          {ed.input === 'boolean' && (
            <div className="flex items-center justify-between rounded-2xl border border-[var(--certa-border)] px-4 py-3">
              <span className="text-sm font-medium">{current ? 'Yes' : 'No'}</span>
              <Switch label={`Override value for ${rule.id}`} checked={!!current} onChange={setValue} />
            </div>
          )}
          {(ed.input === 'date' || ed.input === 'text') && (
            <Field label="New value">
              {(a) => <Input {...a} aria-label={`Override value for ${rule.id}`} type={ed.input === 'date' ? 'date' : 'text'} required value={String(current ?? '')} onChange={(e) => setValue(e.target.value)} />}
            </Field>
          )}
          <Field label="Reason" hint="Required. Shown to auditors next to the value.">
            {(a) => <Input {...a} aria-label={`Override reason for ${rule.id}`} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Company SOP caps altitude at 300 ft" />}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

function RuleCard({ r, onEdit, onClear }: { r: RuleRowViewModel; onEdit: () => void; onClear: () => void }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: EASE }}
      data-rule-id={r.id}
      className="border-b border-[var(--certa-border)] last:border-b-0"
    >
      <div className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto] md:gap-8 sm:px-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{r.title}</h3>
            {r.needsVerification ? (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--certa-warning)', borderColor: 'color-mix(in srgb, var(--certa-warning) 35%, transparent)' }}>
                <FileWarning className="size-3" aria-hidden /> Needs verification
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--certa-current)', borderColor: 'color-mix(in srgb, var(--certa-current) 35%, transparent)' }}>
                <BadgeCheck className="size-3" aria-hidden /> Verified {r.lastVerified?.absolute}
              </span>
            )}
          </div>
          <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--certa-muted)]">{r.description}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <code className="font-mono text-[12px] text-[var(--certa-muted)]">{r.id}</code>
            {r.sourceUrl ? (
              <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                {r.sourceCitation} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <span className="font-medium">{r.sourceCitation}</span>
            )}
            <span className="text-[var(--certa-muted)]">{r.lastVerified ? `Last verified ${r.lastVerified.display}` : 'Not yet verified'}</span>
          </div>
        </div>
        <div className="flex flex-row items-start justify-between gap-4 md:flex-col md:items-end">
          <div className="md:text-right">
            <motion.div key={r.valueDisplay} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="headline tabular text-[22px] leading-tight">
              {r.valueDisplay}
            </motion.div>
            {r.packValueDisplay && <div className="tabular text-[13px] text-[var(--certa-muted)] line-through">{r.packValueDisplay}</div>}
            {r.statedAs && !r.packValueDisplay && <div className="text-[12px] text-[var(--certa-muted)]">{r.statedAs}</div>}
          </div>
          {r.canOverride && (
            <div className="flex gap-1.5">
              {r.override && (
                <Button variant="ghost" size="sm" onClick={onClear} icon={<RotateCcw className="size-3.5" aria-hidden />}>
                  Clear
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onEdit} icon={<PencilLine className="size-3.5" aria-hidden />}>
                Override
              </Button>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {r.override && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
            <div className="mx-5 mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm sm:mx-6" style={{ borderColor: 'color-mix(in srgb, var(--certa-info) 35%, transparent)', background: 'color-mix(in srgb, var(--certa-info) 6%, var(--certa-surface))' }}>
              <ShieldAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--certa-info)' }} aria-hidden />
              <div>
                <span className="font-semibold">Organization override.</span> {r.override.reason}
                <div className="mt-0.5 text-[12px] text-[var(--certa-muted)]">
                  Set by {r.override.setBy ?? 'unknown'} · {r.override.setAt.display}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function RulePackAdminScreen(props: RulePackAdminScreenProps) {
  const [editing, setEditing] = useState<RuleRowViewModel | null>(null);
  const [clearing, setClearing] = useState<RuleRowViewModel | null>(null);
  const [clearReason, setClearReason] = useState('');
  const groups = useMemo(() => {
    const m = new Map<string, RuleRowViewModel[]>();
    for (const r of props.rules) m.set(r.appliesTo, [...(m.get(r.appliesTo) ?? []), r]);
    return [...m.entries()];
  }, [props.rules]);
  const appliesOptions = [{ value: 'all', label: 'All' }, ...['pilot', 'aircraft', 'operation', 'incident'].map((v) => ({ value: v, label: APPLIES[v]! }))];

  return (
    <div>
      <PageHeader
        eyebrow={props.pack ? `Rule pack · ${props.pack.jurisdiction} v${props.pack.version}` : 'Rule pack'}
        title={props.pack?.name ?? 'Rule pack'}
        description={props.pack ? `${props.pack.authority} · effective ${props.pack.effectiveFrom.absolute}. Regulatory values are data: each one cites its source, and your organization can override a value with a recorded reason.` : undefined}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      {props.pack && (
        <Rise delay={0.05}>
          <Card data-testid="rule-pack-header" className="mb-8 grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <Label>Before launch</Label>
              <p data-testid="unverified-count" role="note" className="text-[15px] font-semibold">
                {props.pack.unverifiedCount} of {props.pack.ruleCount} values pending verification.
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--certa-muted)]">{props.pack.disclaimer}</p>
              <p className="sr-only">
                {props.pack.name} {props.pack.jurisdiction}
              </p>
            </div>
            <div className="self-center">
              <VerificationMeter verified={props.pack.ruleCount - props.pack.unverifiedCount} total={props.pack.ruleCount} />
            </div>
          </Card>
        </Rise>
      )}

      <Rise delay={0.1} className="sticky top-14 z-20 -mx-4 mb-6 bg-[color-mix(in_srgb,var(--certa-canvas)_88%,transparent)] px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:top-0 lg:-mx-12 lg:px-12">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--certa-muted)]" aria-hidden />
            <Input aria-label="Search rules" placeholder="Search rules, ids, citations…" className="pl-10" value={props.filter.search} onChange={(e) => props.onFilterChange({ ...props.filter, search: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Applies to" value={props.filter.appliesTo ?? 'all'} options={appliesOptions} onChange={(v) => props.onFilterChange({ ...props.filter, appliesTo: v === 'all' ? null : v })} />
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch label="Unverified only" checked={props.filter.unverifiedOnly} onChange={(v) => props.onFilterChange({ ...props.filter, unverifiedOnly: v })} />
              Unverified only
            </label>
          </div>
        </div>
      </Rise>

      {props.loading && props.rules.length === 0 ? (
        <Card className="p-6">
          <SkeletonRows rows={6} />
        </Card>
      ) : props.rules.length === 0 ? (
        <EmptyState empty={props.empty} icon={<Search className="size-7" aria-hidden />} />
      ) : (
        <div className="space-y-8">
          {groups.map(([applies, rules]) => (
            <motion.section key={applies} layout transition={{ duration: 0.4, ease: EASE }}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <Label>{APPLIES[applies] ?? applies}</Label>
                <span className="tabular text-[12px] text-[var(--certa-muted)]">{rules.length}</span>
              </div>
              <Card className="overflow-hidden">
                <ul data-testid="rules-table">
                  <AnimatePresence initial={false} mode="popLayout">
                    {rules.map((r) => (
                      <RuleCard key={r.id} r={r} onEdit={() => setEditing(r)} onClear={() => setClearing(r)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            </motion.section>
          ))}
        </div>
      )}

      {props.credentialTypes.length > 0 && (
        <section className="mt-14">
          <h2 className="headline mb-1 text-2xl">Credential types</h2>
          <p className="mb-5 text-[14px] text-[var(--certa-muted)]">How this rule pack decides when a pilot credential expires.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {props.credentialTypes.map((c, i) => (
              <Rise key={c.id} delay={0.03 * i}>
                <Card interactive className="h-full p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-semibold">{c.label}</h3>
                    {c.requiredForCurrency && <span className="shrink-0 rounded-full bg-[var(--certa-action)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--certa-onAction)] uppercase">Required</span>}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--certa-muted)]">{c.description}</p>
                  <p className="mt-3 text-[13px] font-medium">{c.validity}</p>
                </Card>
              </Rise>
            ))}
          </div>
        </section>
      )}

      <OverrideDialog
        rule={editing}
        onClose={() => setEditing(null)}
        onSave={(value, reason) => {
          if (editing) props.onSetOverride({ ruleId: editing.id, value, reason });
          setEditing(null);
        }}
      />
      <Dialog
        open={!!clearing}
        onClose={() => setClearing(null)}
        title="Restore the pack value?"
        description={clearing ? `${clearing.title} returns to ${clearing.packValueDisplay ?? clearing.valueDisplay}.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearing(null)}>
              Cancel
            </Button>
            <Button
              disabled={clearReason.trim().length < 3}
              onClick={() => {
                if (clearing) props.onClearOverride({ ruleId: clearing.id, reason: clearReason.trim() });
                setClearing(null);
                setClearReason('');
              }}
            >
              Restore pack value
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="Recorded in the audit log.">
          {(a) => <Input {...a} value={clearReason} onChange={(e) => setClearReason(e.target.value)} placeholder="e.g. Back to the regulation value" />}
        </Field>
      </Dialog>
    </div>
  );
}
