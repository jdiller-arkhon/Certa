'use client';

import type { MissionDetailScreenProps } from '@certa/contract';
import { ExternalLink, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConditionsPanel } from '@/components/conditions';
import { GoNoGoPanel } from '@/components/go-no-go';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/text';
import { Facts, FlightRows, ListCard, Section, Stat, StatGrid } from './_parts';

const DECISION = { green: 'go', amber: 'caution', red: 'no_go' } as const;

export function MissionDetailScreen(props: MissionDetailScreenProps) {
  const [confirm, setConfirm] = useState(false);
  const m = props.mission;
  if (!m) {
    return props.loading ? (
      <Card className="p-6"><SkeletonRows rows={6} /></Card>
    ) : (
      <EmptyState empty={{ title: 'Mission not found', body: props.error ?? 'It may have been deleted.', actionLabel: null }} icon={<MapPin className="size-7" aria-hidden />} />
    );
  }
  const primary = props.statusActions[0];
  const readiness = props.readiness && <GoNoGoPanel variant="mission" result={{ decision: DECISION[props.readiness.level], checks: props.readiness.checks }} />;
  return (
    <div>
      <PageHeader
        eyebrow={`Mission · ${m.status.label}`}
        title={m.name}
        description={[m.window ?? 'No date set', m.locationName].filter(Boolean).join(' · ')}
        actions={
          <>
            {props.canLogFlight && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={props.onLogFlight}>Log flight</Button>}
            {props.canEdit && <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={props.onEdit}>Edit</Button>}
          </>
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <StatGrid>
        <Stat label="Flights" value={m.flights.count} />
        <Stat label="Flight time" value={m.flights.total} />
        <Stat label="Max altitude" value={m.maxAltitude ?? '—'} />
        <Stat label="Crew" value={m.crew.length} sub={m.aircraft.length === 1 ? '1 aircraft' : `${m.aircraft.length} aircraft`} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* On phones the verdict comes first; on wide screens it heads the side column. */}
          {readiness && <div className="lg:hidden">{readiness}</div>}
          <Section title="Plan">
            <Facts
              items={[
                ['Starts', m.starts?.absolute],
                ['Ends', m.ends?.absolute],
                ['Operation', m.operationType],
                ['Location', m.locationName],
                [
                  'Coordinates',
                  m.location && (
                    <a
                      className="tabular inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
                      href={`https://www.openstreetmap.org/?mlat=${m.location.lat}&mlon=${m.location.lon}#map=15/${m.location.lat}/${m.location.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m.location.lat.toFixed(5)}, {m.location.lon.toFixed(5)} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ),
                ],
                ['Max altitude', m.maxAltitude],
                ['Deliverables', m.deliverables],
              ]}
            />
            {m.purpose && <p className="mt-5 rounded-xl bg-[var(--certa-inset)] px-4 py-3 text-[14px] whitespace-pre-wrap">{m.purpose}</p>}
          </Section>

          <Section title="Crew and aircraft">
            <ul className="divide-y divide-[var(--certa-border)]">
              {m.crew.map((c) => (
                <li key={c.pilotId} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <button type="button" onClick={() => props.onOpenHref(c.href)} className="font-semibold underline-offset-4 hover:underline">{c.name}</button>
                  <span className="text-[13px] text-[var(--certa-muted)]">{c.role}</span>
                </li>
              ))}
              {m.aircraft.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <button type="button" onClick={() => props.onOpenHref(a.href)} className="font-semibold underline-offset-4 hover:underline">{a.name}</button>
                  <span className="text-[13px] text-[var(--certa-muted)]">Aircraft</span>
                </li>
              ))}
              {!m.crew.length && !m.aircraft.length && <li className="py-2.5 text-[14px] text-[var(--certa-muted)]">No crew or aircraft assigned yet.</li>}
            </ul>
          </Section>

          {m.authorizations.length > 0 && (
            <Section title="Authorizations">
              <ul className="space-y-3">
                {m.authorizations.map((a) => (
                  <li key={a.id} className="text-[14px]">
                    <span className="tabular font-semibold">{a.label}</span>
                    {a.detail && <span className="block text-[13px] text-[var(--certa-muted)]">{a.detail}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <ListCard title="Flights" count={props.flights.length}>
            {props.flights.length ? (
              <FlightRows flights={props.flights} onOpen={props.onOpenFlight} />
            ) : (
              <li className="px-5 py-6 text-[14px] text-[var(--certa-muted)]">No flights logged for this mission yet.{props.canLogFlight ? ' Use Log flight to start one filled in from this plan.' : ''}</li>
            )}
          </ListCard>
        </div>

        <div className="space-y-6">
          {readiness && <div className="hidden lg:block">{readiness}</div>}
          {m.location ? (
            <ConditionsPanel
              title="Conditions at the site"
              intro="Airspace, TFRs, restricted areas, weather, and daylight at the mission location, from FAA, NWS and NOAA data. Forecasts only reach a few days out; check again on the day."
              conditions={props.conditions}
              onCheck={props.onCheckConditions}
            />
          ) : null}
          {props.canEdit && (
            <Card className="p-5">
              <div className="flex flex-col gap-2">
                {primary && (
                  <Button variant="secondary" disabled={props.busy} onClick={() => props.onSetStatus(primary.status)}>
                    {primary.label}
                  </Button>
                )}
                {props.statusActions.slice(1).map((a) => (
                  <Button key={a.status} variant="ghost" disabled={props.busy} onClick={() => props.onSetStatus(a.status)}>
                    {a.label}
                  </Button>
                ))}
                <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} disabled={props.busy} onClick={() => setConfirm(true)}>
                  Delete mission
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${m.name}?`}
        description="Flights logged for it stay in the logbook. The deletion is kept in the audit log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => (setConfirm(false), props.onDelete())}>Delete mission</Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
