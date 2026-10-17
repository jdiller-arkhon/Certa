'use client';

import type { AircraftDetailScreenProps } from '@certa/contract';
import { Box, FileDown, OctagonAlert, Pencil, Plane, Route, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { AircraftViewer } from '@/components/hangar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { Panel, PanelRow, StatStrip } from '@/components/ui/panel';
import { StatusBadge } from '@/components/ui/status';
import { TabPanel, Tabs, useHashTab, type TabDef } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/text';
import { ShareButton, ShareDialog } from './_share';
import { FlightRows, ListCard, Reasons, RowButton, RowMetric, RowTitle, Section, TextArea, When } from './_parts';

const TABS = ['overview', 'flights', 'maintenance', 'batteries', 'model'] as const;

/** Today's date on this device, as YYYY-MM-DD. */
const todayIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export function AircraftDetailScreen(props: AircraftDetailScreenProps) {
  const [dialog, setDialog] = useState<'ground' | 'unground' | null>(null);
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState(false);
  /** undefined = closed; null = unscheduled work; string = schedule id. */
  const [logging, setLogging] = useState<string | null | undefined>(undefined);
  const [work, setWork] = useState({ performedOn: todayIso(), performedBy: '', description: '' });
  const loggingSchedule = props.maintenance.due.find((d) => d.id === logging);
  const openLog = (scheduleId: string | null) => {
    const sched = props.maintenance.due.find((d) => d.id === scheduleId);
    setWork({ performedOn: todayIso(), performedBy: work.performedBy, description: sched ? `${sched.name} completed.` : '' });
    setLogging(scheduleId);
  };
  const a = props.aircraft;
  const tabIds = props.canEdit ? TABS : TABS.filter((t) => t !== 'model');
  const [tab, setTab] = useHashTab(tabIds);

  if (props.loading && !a) return <Card className="p-6"><SkeletonRows rows={5} /></Card>;
  if (!a) return <EmptyState empty={{ title: 'Aircraft not found', body: 'This aircraft may have been removed, or you may not have access.', actionLabel: null }} icon={<Plane className="size-7" aria-hidden />} />;
  const grounded = !!a.groundedReason;
  const tabs: TabDef<(typeof TABS)[number]>[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'flights', label: 'Flights', count: a.totals.flights },
    { id: 'maintenance', label: 'Maintenance', count: props.maintenance.due.filter((d) => d.status.level !== 'green').length || undefined },
    { id: 'batteries', label: 'Batteries', count: props.batteries.length },
    ...(props.canEdit ? [{ id: 'model' as const, label: '3D model' }] : []),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Aircraft"
        title={a.name}
        description={[a.name !== a.makeModel && a.makeModel, a.registrationNumber, `S/N ${a.serialNumber}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <ShareButton share={props.share} onOpen={() => setSharing(true)} />
            <Button variant="secondary" icon={<FileDown className="size-4" aria-hidden />} onClick={props.onExportLogbook}>Logbook</Button>
            {props.canEdit && <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={props.onEdit}>Edit</Button>}
            {props.canGround &&
              (grounded ? (
                <Button icon={<ShieldCheck className="size-4" aria-hidden />} onClick={() => setDialog('unground')}>Return to service</Button>
              ) : (
                <Button variant="danger" icon={<OctagonAlert className="size-4" aria-hidden />} onClick={() => setDialog('ground')}>Ground</Button>
              ))}
          </>
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <Tabs label="Aircraft sections" tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <TabPanel key="overview" label="Overview" className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel label="Aircraft" meta={<span>{props.model.custom ? 'Uploaded model' : 'Generic airframe'}</span>} className="lg:col-span-2">
            <AircraftViewer airframe={props.model.airframe} modelUrl={props.model.url} label={`${a.name}, 3D model`} />
          </Panel>
          <Panel label="Airworthiness" meta={<StatusBadge status={a.status} size="sm" />}>
            <StatStrip
              items={[
                { label: 'Flights', value: a.totals.flights },
                { label: 'Flight time', value: a.totals.flightTime.display },
                { label: 'Batteries', value: props.batteries.length },
              ]}
            />
            <div className="px-5 py-4">
              {a.reasons.length ? <Reasons reasons={a.reasons} /> : <p className="text-[15px] text-[var(--certa-muted)]">Registered, Remote ID compliant, insured, and maintenance current.</p>}
            </div>
          </Panel>
          <Panel label="Details">
            <div className="py-1.5">
              <PanelRow label="Make & model" value={a.makeModel} />
              <PanelRow label="Serial number" value={a.serialNumber} />
              <PanelRow label="Registration" value={a.registrationNumber ?? '—'} />
              <PanelRow label="Registration expires" value={a.registrationExpires ? <When d={a.registrationExpires} /> : '—'} />
              <PanelRow label="Remote ID" value={a.remoteId} />
              <PanelRow label="Takeoff mass" value={a.takeoffMass?.display ?? '—'} />
              <PanelRow label="Firmware" value={a.firmwareVersion ?? '—'} />
              {a.groundedReason && <PanelRow dot="var(--certa-expired)" label="Grounded because" value={a.groundedReason} />}
            </div>
          </Panel>
        </TabPanel>
      )}

      {tab === 'flights' && (
        <TabPanel key="flights" label="Flights">
          <ListCard title="Recent flights" count={props.recentFlights.length}>
            {props.recentFlights.length ? (
              <FlightRows flights={props.recentFlights} onOpen={props.onOpenFlight} showAircraft={false} />
            ) : (
              <li className="flex flex-col items-center gap-2 px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]"><Route className="size-5" aria-hidden /> No flights logged yet.</li>
            )}
          </ListCard>
        </TabPanel>
      )}

      {tab === 'maintenance' && (
        <TabPanel key="maintenance" label="Maintenance" className="space-y-6">
          <Panel
            label="Schedules"
            meta={props.maintenance.canManage && <button type="button" onClick={() => openLog(null)} className="hover:text-[var(--certa-text)]">Log unscheduled work</button>}
          >
            {props.maintenance.due.length ? (
              <ul>
                {props.maintenance.due.map((d) => (
                  <li key={d.id} className="flex flex-col gap-3 border-b border-[var(--certa-border)] px-5 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{d.name}</span>
                      <span className="block text-[13px] text-[var(--certa-muted)]">
                        {[d.interval, d.usage, d.due && `due ${d.due.display}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={d.status} size="sm" />
                      {props.maintenance.canManage && (
                        <Button size="sm" variant={d.status.level === 'green' ? 'ghost' : 'secondary'} onClick={() => openLog(d.id)}>Log done</Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">No maintenance schedules for this aircraft. Add one on the Maintenance page.</p>
            )}
          </Panel>
          <Panel label="History" meta={<span className="tabular">{props.maintenance.history.length}</span>}>
            {props.maintenance.history.length ? (
              <ul>
                {props.maintenance.history.map((h) => (
                  <li key={h.id} className="flex flex-col gap-1 border-b border-[var(--certa-border)] px-5 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{h.scheduleName ?? h.description}</span>
                      <span className="block text-[13px] text-[var(--certa-muted)]">
                        {h.scheduleName && `${h.description} · `}
                        {h.kind} · {h.performedBy}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[13px] text-[var(--certa-muted)]"><When d={h.performed} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">No work recorded yet.</p>
            )}
          </Panel>
        </TabPanel>
      )}

      {tab === 'batteries' && (
        <TabPanel key="batteries" label="Batteries">
          {props.batteries.length ? (
            <ListCard title="Batteries for this model" count={props.batteries.length}>
              {props.batteries.map((b) => (
                <RowButton key={b.id}>
                  <RowTitle title={b.label} sub={`S/N ${b.serialNumber}`} />
                  <span className="flex items-center gap-6">
                    <RowMetric label="Cycles" value={b.cycleLimit ? `${b.cycleCount} / ${b.cycleLimit}` : b.cycleCount} />
                    <StatusBadge status={b.status} size="sm" />
                  </span>
                </RowButton>
              ))}
            </ListCard>
          ) : (
            <Panel label="Batteries"><p className="px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">No batteries are linked to this model yet.</p></Panel>
          )}
        </TabPanel>
      )}

      {tab === 'model' && props.canEdit && (
        <TabPanel key="model" label="3D model" className="space-y-6">
          <Panel label="Preview">
            <AircraftViewer airframe={props.model.airframe} modelUrl={props.model.url} label={`${a.name}, 3D model`} />
          </Panel>
          <Section title="3D model">
            <p className="mb-3 text-[13px] text-[var(--certa-muted)]">
              {props.model.custom ? 'The hangar shows your uploaded model.' : 'The hangar draws a generic airframe. Upload your own model to show the real aircraft.'} Binary glTF (.glb), up to 20 MB, self-contained.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-4 text-sm font-semibold hover:bg-[var(--certa-inset)] focus-within:outline-3 focus-within:outline-[var(--certa-focus)] ${props.model.uploading ? 'pointer-events-none opacity-50' : ''}`}>
                <Box className="size-4" aria-hidden />
                {props.model.uploading ? 'Uploading…' : props.model.custom ? 'Replace model' : 'Upload .glb'}
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  className="sr-only"
                  aria-label="Upload 3D model"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) props.onUploadModel({ name: file.name, mimeType: file.type || 'model/gltf-binary', sizeBytes: file.size, handle: file });
                    e.target.value = '';
                  }}
                />
              </label>
              {props.model.custom && <Button size="sm" variant="ghost" onClick={props.onRemoveModel} disabled={props.model.uploading}>Use generic model</Button>}
            </div>
            {props.model.error && <p role="alert" className="mt-2 text-[13px] text-[var(--certa-expired)]">{props.model.error}</p>}
          </Section>
        </TabPanel>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'ground' ? `Ground ${a.name}?` : `Return ${a.name} to service?`}
        description={dialog === 'ground' ? 'It shows as not legal to fly everywhere until it is returned to service.' : 'Record what was done. This is logged as unscheduled maintenance.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" form="ground-form" variant={dialog === 'ground' ? 'danger' : 'primary'}>{dialog === 'ground' ? 'Ground aircraft' : 'Return to service'}</Button>
          </>
        }
      >
        <form
          id="ground-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return;
            (dialog === 'ground' ? props.onGround : props.onUnground)({ reason: reason.trim() });
            setDialog(null);
            setReason('');
          }}
        >
          <Field label={dialog === 'ground' ? 'Reason' : 'Work performed'}>{(f) => <TextArea {...f} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </form>
      </Dialog>
      <Dialog
        open={logging !== undefined}
        onClose={() => setLogging(undefined)}
        title={loggingSchedule ? `Log ${loggingSchedule.name}` : 'Log unscheduled work'}
        description={loggingSchedule ? 'Marks it done and restarts its interval.' : 'Repairs, part swaps, or anything outside a schedule.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLogging(undefined)}>Cancel</Button>
            <Button type="submit" form="log-work-form" loading={props.maintenance.saving}>Save</Button>
          </>
        }
      >
        <form
          id="log-work-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!work.performedBy.trim() || !work.description.trim()) return;
            props.onLogMaintenance({ scheduleId: logging ?? null, performedOn: work.performedOn, performedBy: work.performedBy.trim(), description: work.description.trim() });
            setLogging(undefined);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">{(f) => <Input {...f} type="date" required max={todayIso()} value={work.performedOn} onChange={(e) => setWork({ ...work, performedOn: e.target.value })} />}</Field>
            <Field label="Performed by">{(f) => <Input {...f} required autoComplete="name" value={work.performedBy} onChange={(e) => setWork({ ...work, performedBy: e.target.value })} />}</Field>
          </div>
          <Field label="Work performed">{(f) => <TextArea {...f} required value={work.description} onChange={(e) => setWork({ ...work, description: e.target.value })} />}</Field>
        </form>
      </Dialog>
      <ShareDialog open={sharing} onClose={() => setSharing(false)} subject={a.name} share={props.share} onCreate={props.onCreateShareLink} onRevoke={props.onRevokeShareLink} />
    </div>
  );
}
