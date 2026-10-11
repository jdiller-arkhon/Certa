'use client';

import type { AircraftDetailScreenProps } from '@certa/contract';
import { FileDown, OctagonAlert, Pencil, Plane, Route, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { ShareButton, ShareDialog } from './_share';
import { Facts, FlightRows, ListCard, Reasons, RowButton, RowMetric, RowTitle, Section, Stat, StatGrid, TextArea, When } from './_parts';

export function AircraftDetailScreen(props: AircraftDetailScreenProps) {
  const [dialog, setDialog] = useState<'ground' | 'unground' | null>(null);
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState(false);
  const a = props.aircraft;

  if (props.loading && !a) return <Card className="p-6"><SkeletonRows rows={5} /></Card>;
  if (!a) return <EmptyState empty={{ title: 'Aircraft not found', body: 'This aircraft may have been removed, or you may not have access.', actionLabel: null }} icon={<Plane className="size-7" aria-hidden />} />;
  const grounded = !!a.groundedReason;

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

      <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="shrink-0"><StatusBadge status={a.status} /></div>
        <div className="flex-1">{a.reasons.length ? <Reasons reasons={a.reasons} /> : <p className="text-[15px] text-[var(--certa-muted)]">Registered, Remote ID compliant, insured, and maintenance current.</p>}</div>
      </Card>

      <StatGrid>
        <Stat label="Flights" value={a.totals.flights} />
        <Stat label="Flight time" value={a.totals.flightTime.display} />
        <Stat label="Registration" value={a.registrationExpires ? <When d={a.registrationExpires} /> : '—'} sub={a.registrationExpires ? 'expires' : 'not on file'} />
        <Stat label="Batteries" value={props.batteries.length} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Details">
          <Facts
            items={[
              ['Make & model', a.makeModel],
              ['Serial number', <span className="tabular">{a.serialNumber}</span>],
              ['Registration', a.registrationNumber],
              ['Registration expires', a.registrationExpires && <When d={a.registrationExpires} />],
              ['Remote ID', a.remoteId],
              ['Takeoff mass', a.takeoffMass?.display],
              ['Firmware', a.firmwareVersion],
              ['Grounded because', a.groundedReason],
            ]}
          />
        </Section>
        <div className="space-y-6">
          <ListCard title="Recent flights" count={props.recentFlights.length}>
            {props.recentFlights.length ? (
              <FlightRows flights={props.recentFlights} onOpen={props.onOpenFlight} showAircraft={false} />
            ) : (
              <li className="flex flex-col items-center gap-2 px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]"><Route className="size-5" aria-hidden /> No flights logged yet.</li>
            )}
          </ListCard>
          {props.batteries.length > 0 && (
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
          )}
        </div>
      </div>

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
