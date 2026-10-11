'use client';

import type { MaintenanceScreenProps } from '@certa/contract';
import { ClipboardCheck, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { ListCard, RowButton, RowTitle, TextArea, When, num } from './_parts';

const today = () => new Date().toISOString().slice(0, 10);

export function MaintenanceScreen(props: MaintenanceScreenProps) {
  const [dialog, setDialog] = useState<'schedule' | 'log' | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [allHistory, setAllHistory] = useState(false);
  const firstTarget = props.targetOptions[0]?.value ?? '';
  const [sch, setSch] = useState({ target: firstTarget, name: '', everyHours: '', everyFlights: '', everyDays: '', grounds: true });
  const [log, setLog] = useState({ scheduleId: '', target: firstTarget, performedOn: today(), performedBy: '', description: '' });
  const openLog = (scheduleId: string | null) => {
    const row = props.due.find((d) => d.id === scheduleId);
    const target = row ? row.targetKey : log.target || firstTarget;
    setLog({ ...log, scheduleId: scheduleId ?? '', target, performedOn: today(), description: row ? `${row.name} completed.` : '' });
    setDialog('log');
  };
  const hasInterval = !!(num(sch.everyHours) || num(sch.everyFlights) || num(sch.everyDays));
  const attention = props.due.filter((d) => d.status.level !== 'green').length;

  return (
    <div>
      <PageHeader
        eyebrow="Fleet"
        title="Maintenance"
        description="Schedules by flight hours, flights, or calendar days. Usage is counted from your logbook."
        actions={
          props.canManage && (
            <>
              <Button variant="secondary" icon={<ClipboardCheck className="size-4" aria-hidden />} onClick={() => openLog(null)} disabled={!props.targetOptions.length}>Log work</Button>
              <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog('schedule')} disabled={!props.targetOptions.length}>Add schedule</Button>
            </>
          )
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      {props.loading && !props.due.length ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : !props.due.length ? (
        <EmptyState empty={props.empty} icon={<Wrench className="size-7" aria-hidden />} onAction={props.canManage && props.targetOptions.length ? () => setDialog('schedule') : undefined} />
      ) : (
        <ListCard title="Due" count={props.due.length} aside={<span className="text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{attention ? `${attention} need attention` : 'All current'}</span>}>
          {props.due.map((d) => (
            <RowButton key={d.id}>
              <RowTitle
                title={d.name}
                sub={
                  <>
                    <button type="button" className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline" onClick={() => props.onOpenTarget(d.targetHref)}>{d.target}</button>
                    {' · '}{d.interval}{d.grounds && ' · grounds when overdue'}
                  </>
                }
              />
              <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="flex flex-col text-[13px] sm:items-end">
                  {d.usage && <span className="tabular font-semibold">{d.usage}</span>}
                  {d.due && <span className="text-[var(--certa-muted)]">Due <When d={d.due} /></span>}
                </span>
                <StatusBadge status={d.status} size="sm" />
                {props.canManage && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openLog(d.id)}>Done</Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove schedule ${d.name}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setRemoving(d.id)} />
                  </span>
                )}
              </span>
            </RowButton>
          ))}
        </ListCard>
      )}

      {props.history.length > 0 && (
        <ListCard title="History" count={props.history.length} className="mt-6">
          {(allHistory ? props.history : props.history.slice(0, 8)).map((h) => (
            <RowButton key={h.id}>
              <RowTitle title={h.scheduleName ?? h.description} sub={<>{h.target} · {h.performedBy} · <When d={h.performed} /></>} />
              <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--certa-muted)]">
                <span className="rounded-full border border-[var(--certa-border)] px-2 py-0.5">{h.kind}</span>
                {h.signedOff && <span className="rounded-full border border-[var(--certa-border)] px-2 py-0.5">Signed off</span>}
              </span>
            </RowButton>
          ))}
          {props.history.length > 8 && (
            <li className="px-5 py-3 text-center">
              <button type="button" className="text-[13px] font-semibold text-[var(--certa-muted)] underline-offset-4 hover:underline" onClick={() => setAllHistory((v) => !v)}>
                {allHistory ? 'Show recent only' : `Show all ${props.history.length}`}
              </button>
            </li>
          )}
        </ListCard>
      )}

      <Dialog
        open={dialog === 'schedule'}
        onClose={() => setDialog(null)}
        title="Add maintenance schedule"
        description="Due at whichever interval comes first. Counting starts now."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" form="schedule-form" arrow disabled={!hasInterval} loading={props.saving}>Add schedule</Button>
          </>
        }
      >
        <form
          id="schedule-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasInterval) return;
            props.onAddSchedule({ target: sch.target, name: sch.name.trim(), everyHours: num(sch.everyHours), everyFlights: num(sch.everyFlights), everyDays: num(sch.everyDays), groundsWhenOverdue: sch.grounds });
            setDialog(null);
            setSch({ ...sch, name: '', everyHours: '', everyFlights: '', everyDays: '' });
          }}
        >
          <Field label="Applies to">
            {(a) => (
              <Select {...a} value={sch.target} onChange={(e) => setSch({ ...sch, target: e.target.value })}>
                {props.targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Name">{(a) => <Input {...a} required placeholder="Motor and propeller inspection" value={sch.name} onChange={(e) => setSch({ ...sch, name: e.target.value })} />}</Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Every">{(a) => <Input {...a} inputMode="decimal" suffix="h" value={sch.everyHours} onChange={(e) => setSch({ ...sch, everyHours: e.target.value })} />}</Field>
            <Field label="or every">{(a) => <Input {...a} inputMode="numeric" suffix="flt" value={sch.everyFlights} onChange={(e) => setSch({ ...sch, everyFlights: e.target.value })} />}</Field>
            <Field label="or every">{(a) => <Input {...a} inputMode="numeric" suffix="days" value={sch.everyDays} onChange={(e) => setSch({ ...sch, everyDays: e.target.value })} />}</Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--certa-border)] px-4 py-3">
            <span className="text-[14px]">
              <span className="font-semibold">Ground when overdue</span>
              <span className="block text-[13px] text-[var(--certa-muted)]">Shows the aircraft as not legal to fly past the interval.</span>
            </span>
            <Switch label="Ground when overdue" checked={sch.grounds} onChange={(grounds) => setSch({ ...sch, grounds })} />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'log'}
        onClose={() => setDialog(null)}
        title="Log maintenance"
        description="Completing a scheduled item resets its interval."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" form="log-form" arrow loading={props.saving}>Save</Button>
          </>
        }
      >
        <form
          id="log-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onLogMaintenance({ scheduleId: log.scheduleId || null, target: log.target, performedOn: log.performedOn, performedBy: log.performedBy.trim(), description: log.description.trim() });
            setDialog(null);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aircraft or battery">
              {(a) => (
                <Select {...a} value={log.target} disabled={!!log.scheduleId} onChange={(e) => setLog({ ...log, target: e.target.value })}>
                  {props.targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Schedule">
              {(a) => (
                <Select {...a} value={log.scheduleId} onChange={(e) => setLog({ ...log, scheduleId: e.target.value })}>
                  <option value="">Unscheduled work</option>
                  {props.due.filter((d) => d.targetKey === log.target).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">{(a) => <Input {...a} type="date" required max={today()} value={log.performedOn} onChange={(e) => setLog({ ...log, performedOn: e.target.value })} />}</Field>
            <Field label="Performed by">{(a) => <Input {...a} required autoComplete="name" value={log.performedBy} onChange={(e) => setLog({ ...log, performedBy: e.target.value })} />}</Field>
          </div>
          <Field label="Work performed">{(a) => <TextArea {...a} required value={log.description} onChange={(e) => setLog({ ...log, description: e.target.value })} />}</Field>
        </form>
      </Dialog>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this schedule?"
        description="Past maintenance records are kept."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (removing && props.onRemoveSchedule(removing), setRemoving(null))}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]">{props.due.find((d) => d.id === removing)?.name}</p>
      </Dialog>
    </div>
  );
}
