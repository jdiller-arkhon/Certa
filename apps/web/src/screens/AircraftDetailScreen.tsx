'use client';

import type { AircraftDetailScreenProps } from '@certa/contract';
import { Box, FileDown, OctagonAlert, Pencil, Plane, Route, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { Panel, PanelRow, StatStrip } from '@/components/ui/panel';
import { StatusBadge } from '@/components/ui/status';
import { TabPanel, Tabs, useHashTab, type TabDef } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/text';
import { ShareButton, ShareDialog } from './_share';
import { FlightRows, ListCard, Reasons, RowButton, RowMetric, RowTitle, Section, TextArea, When } from './_parts';

const TABS = ['overview', 'flights', 'batteries', 'model'] as const;

export function AircraftDetailScreen(props: AircraftDetailScreenProps) {
  const [dialog, setDialog] = useState<'ground' | 'unground' | null>(null);
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState(false);
  const a = props.aircraft;
  const tabIds = props.canEdit ? TABS : TABS.filter((t) => t !== 'model');
  const [tab, setTab] = useHashTab(tabIds);

  if (props.loading && !a) return <Card className="p-6"><SkeletonRows rows={5} /></Card>;
  if (!a) return <EmptyState empty={{ title: 'Aircraft not found', body: 'This aircraft may have been removed, or you may not have access.', actionLabel: null }} icon={<Plane className="size-7" aria-hidden />} />;
  const grounded = !!a.groundedReason;
  const tabs: TabDef<(typeof TABS)[number]>[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'flights', label: 'Flights', count: a.totals.flights },
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
        <TabPanel key="model" label="3D model">
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
      <ShareDialog open={sharing} onClose={() => setSharing(false)} subject={a.name} share={props.share} onCreate={props.onCreateShareLink} onRevoke={props.onRevokeShareLink} />
    </div>
  );
}
