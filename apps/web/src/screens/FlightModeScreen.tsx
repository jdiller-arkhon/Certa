'use client';

import type { Advisory, GoNoGoResult, MarkerKind, ReadinessLevel, StatusBadge as StatusBadgeVM } from '@certa/core';
import { MARKER_KINDS, MARKER_LABEL } from '@certa/core';
import { AlertTriangle, Bird, CloudSun, Compass, Copy, Flag, MapPin, Phone, Plane, PlaneLanding, PlaneTakeoff, RadioTower, Siren, Sunset, Trash2, BatteryWarning } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/components/cn';
import { GoNoGoPanel } from '@/components/go-no-go';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LEVEL_COLOR, LevelDot, LevelIcon } from '@/components/ui/status';
import { Label, PageHeader } from '@/components/ui/text';

export interface FlightModeSetup {
  pilotOptions: { value: string; label: string; status: StatusBadgeVM }[];
  aircraftOptions: { value: string; label: string; status: StatusBadgeVM; model: string }[];
  batteryOptions: { value: string; label: string; status: StatusBadgeVM; aircraftModel: string | null }[];
  siteOptions: { value: string; label: string; recent: boolean }[];
  defaults: { pilotId: string; aircraftId: string | null; locationName: string | null };
  preflight: GoNoGoResult | null;
}

export interface FlightModeLive {
  title: string;
  subtitle: string;
  phase: 'ground' | 'airborne';
  timer: { label: string; value: string };
  landBy: { remaining: string; fraction: number; level: ReadinessLevel; note: string } | null;
  batteries: { value: string; label: string; status: StatusBadgeVM; flown: number }[];
  nextBatteryIds: string[];
  inAir: string | null;
  askCharge: boolean;
  sorties: { id: string; n: number; when: string; duration: string; batteries: string; charge: string | null; airborne: boolean }[];
  totalAir: string;
  landedCount: number;
  markers: { id: string; time: string; label: string }[];
  conditions: { status: 'idle' | 'locating' | 'loading' | 'ready' | 'error'; summary: string | null; level: ReadinessLevel | null; checked: string | null; daylight: string | null; error: string | null };
  changes: Advisory[];
  emergency: { decimal: string | null; dms: string | null; site: string | null; aircraft: string; pilot: string };
  wakeLock: boolean;
}

export interface FlightModeScreenProps {
  setup: FlightModeSetup | null;
  live: FlightModeLive | null;
  conditionsSetup: { status: FlightModeLive['conditions']['status']; error: string | null };
  saving: boolean;
  error: string | null;
  onSelection: (v: { pilotId: string; aircraftId: string | null; batteryIds: string[] }) => void;
  onStart: (v: { pilotId: string; aircraftId: string; batteryIds: string[]; locationName: string | null }) => void;
  onCheckConditions: () => void;
  onTakeOff: (batteryIds: string[]) => void;
  onLand: () => void;
  onCharge: (pct: number | null) => void;
  onMark: (kind: MarkerKind) => void;
  onDiscardSortie: (id: string) => void;
  onDismissChanges: () => void;
  onFinish: (notes: string) => void;
  onDiscardSession: () => void;
  onCancel: () => void;
}

const MARKER_ICON: Record<MarkerKind, ReactNode> = {
  manned_aircraft: <Plane className="size-4" aria-hidden />,
  wildlife: <Bird className="size-4" aria-hidden />,
  signal_loss: <RadioTower className="size-4" aria-hidden />,
  battery_warning: <BatteryWarning className="size-4" aria-hidden />,
  compass_warning: <Compass className="size-4" aria-hidden />,
  other: <Flag className="size-4" aria-hidden />,
};
const CHARGES = [80, 60, 40, 30, 20];

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--certa-focus)]',
        active ? 'border-[var(--certa-action)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] bg-[var(--certa-surface)] hover:bg-[var(--certa-inset)]',
      )}
    >
      {children}
    </button>
  );
}

/** Flight mode: start a session on site, then take off and land sortie by sortie. */
export function FlightModeScreen(props: FlightModeScreenProps) {
  return props.live ? <Live {...props} live={props.live} /> : props.setup ? <Setup {...props} setup={props.setup} /> : null;
}

function Setup({ setup, conditionsSetup, error, onSelection, onStart, onCheckConditions, onCancel }: FlightModeScreenProps & { setup: FlightModeSetup }) {
  const [pilotId, setPilotId] = useState(setup.defaults.pilotId);
  const [aircraftId, setAircraftId] = useState(setup.defaults.aircraftId ?? '');
  const [batteryIds, setBatteryIds] = useState<string[]>([]);
  const [location, setLocation] = useState(setup.defaults.locationName ?? '');
  const [allBatteries, setAllBatteries] = useState(false);
  const model = setup.aircraftOptions.find((o) => o.value === aircraftId)?.model;
  const fitting = setup.batteryOptions.filter((b) => !model || !b.aircraftModel || b.aircraftModel === model || batteryIds.includes(b.value));
  const shown = allBatteries ? setup.batteryOptions : fitting;
  const select = (next: { pilotId?: string; aircraftId?: string; batteryIds?: string[] }) => {
    const v = { pilotId: next.pilotId ?? pilotId, aircraftId: (next.aircraftId ?? aircraftId) || null, batteryIds: next.batteryIds ?? batteryIds };
    onSelection(v);
  };
  const toggle = (id: string) => {
    const next = batteryIds.includes(id) ? batteryIds.filter((b) => b !== id) : [...batteryIds, id];
    setBatteryIds(next);
    select({ batteryIds: next });
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Flight mode" title="Start on site" description="Pick the aircraft and the batteries you brought. Each takeoff to landing is logged as its own flight. Works offline and keeps the screen awake." />
      <Banners>{error && <Banner key="e" tone="error">{error}</Banner>}</Banners>
      <form
        className="grid gap-6 lg:grid-cols-[1fr_300px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (aircraftId && pilotId) onStart({ pilotId, aircraftId, batteryIds, locationName: location.trim() || null });
        }}
      >
        <Card className="space-y-6 p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Pilot in command">
              {(a) => (
                <Select {...a} value={pilotId} onChange={(e) => (setPilotId(e.target.value), select({ pilotId: e.target.value }))}>
                  {setup.pilotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Aircraft">
              {(a) => (
                <Select {...a} required value={aircraftId} onChange={(e) => (setAircraftId(e.target.value), select({ aircraftId: e.target.value }))}>
                  <option value="" disabled>Choose aircraft</option>
                  {setup.aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}{o.status.level !== 'green' ? ` — ${o.status.label}` : ''}</option>)}
                </Select>
              )}
            </Field>
          </div>
          {setup.batteryOptions.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Batteries you brought</legend>
              <div className="flex flex-wrap gap-2">
                {shown.map((b) => (
                  <Chip key={b.value} active={batteryIds.includes(b.value)} onClick={() => toggle(b.value)} label={`${b.label}, ${b.status.label}`}>
                    <LevelDot level={b.status.level} /> {b.label}
                  </Chip>
                ))}
                {fitting.length < setup.batteryOptions.length && (
                  <button type="button" className="h-10 px-2 text-[13px] font-semibold text-[var(--certa-muted)] underline-offset-4 hover:underline" onClick={() => setAllBatteries((v) => !v)}>
                    {allBatteries ? `Only ${model} batteries` : `Show all ${setup.batteryOptions.length}`}
                  </button>
                )}
              </div>
              {!shown.length && <p className="text-[13px] text-[var(--certa-muted)]">No batteries on file for this aircraft. You can still fly; sorties are logged without batteries.</p>}
              <p className="mt-2 text-[13px] text-[var(--certa-muted)]">Certa suggests the battery that has rested longest for each takeoff.</p>
            </fieldset>
          )}
          <Field label="Site">{(a) => <Input {...a} list="fm-sites" placeholder="Site name" value={location} onChange={(e) => setLocation(e.target.value)} />}</Field>
          <datalist id="fm-sites">{setup.siteOptions.map((s) => <option key={s.value} value={s.value} />)}</datalist>
        </Card>
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {setup.preflight ? <GoNoGoPanel result={setup.preflight} compact /> : (
            <Card className="p-5 text-[14px] text-[var(--certa-muted)]"><Label>Pre-flight check</Label><p className="mt-2">Choose the aircraft to check it against records on file.</p></Card>
          )}
          <Button variant="secondary" className="w-full" icon={<CloudSun className="size-4" aria-hidden />} loading={conditionsSetup.status === 'locating' || conditionsSetup.status === 'loading'} onClick={onCheckConditions}>
            {conditionsSetup.status === 'ready' ? 'Recheck conditions here' : 'Check conditions here'}
          </Button>
          {conditionsSetup.error && <p className="text-[13px] text-[var(--certa-expired)]">{conditionsSetup.error}</p>}
          <Button type="submit" size="lg" className="w-full" arrow disabled={!aircraftId || !pilotId}>Start flight mode</Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

function Live(props: FlightModeScreenProps & { live: FlightModeLive }) {
  const { live } = props;
  const [next, setNext] = useState<string[] | null>(null);
  const chosen = next ?? live.nextBatteryIds;
  const [emergency, setEmergency] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState('');
  const [marked, setMarked] = useState<string | null>(null);
  const airborne = live.phase === 'airborne';
  return (
    <div className="mx-auto max-w-xl pb-28">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">
            <span className="relative flex size-2" aria-hidden>
              {airborne && <span className="ping absolute inset-0 rounded-full bg-[var(--certa-current)]" />}
              <span className={cn('relative size-2 rounded-full', airborne ? 'bg-[var(--certa-current)]' : 'bg-[var(--certa-muted)]')} />
            </span>
            Flight mode · {airborne ? 'In flight' : 'On the ground'}
          </div>
          <h1 className="headline mt-1 line-clamp-2 text-[26px] leading-tight">{live.title}</h1>
          <p className="truncate text-[14px] text-[var(--certa-muted)]">{live.subtitle}</p>
        </div>
        <Button variant="danger" size="sm" icon={<Siren className="size-4" aria-hidden />} onClick={() => setEmergency(true)}>Emergency</Button>
      </div>

      <Banners>
        {props.error && <Banner key="e" tone="error">{props.error}</Banner>}
        {live.changes.length > 0 && (
          <Banner key="c" tone="warning" onDismiss={props.onDismissChanges}>
            <span className="font-semibold">Conditions changed: </span>
            {live.changes.map((c) => c.title).join(' · ')}
          </Banner>
        )}
      </Banners>

      <Card className="overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center">
          <div className="text-[12px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">{live.timer.label}</div>
          <div className="tabular mt-1 text-[68px] leading-none font-semibold tracking-tight" aria-live="off" data-testid="fm-timer">{live.timer.value}</div>
          {live.inAir && <div className="mt-2 text-[14px] text-[var(--certa-muted)]">{live.inAir}</div>}
        </div>
        {live.landBy && (
          <div className="border-t border-[var(--certa-border)] px-6 py-4">
            <div className="mb-2 flex items-baseline justify-between text-[14px]">
              <span className="font-semibold" style={{ color: live.landBy.level === 'green' ? undefined : LEVEL_COLOR[live.landBy.level] }}>Land by · {live.landBy.remaining}</span>
              <span className="text-[12.5px] text-[var(--certa-muted)]">{live.landBy.note}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--certa-inset)]" role="progressbar" aria-label="Typical sortie used" aria-valuenow={Math.round(live.landBy.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${live.landBy.fraction * 100}%`, background: LEVEL_COLOR[live.landBy.level] }} />
            </div>
          </div>
        )}
        {!airborne && live.batteries.length > 0 && !live.askCharge && (
          <div className="border-t border-[var(--certa-border)] px-6 py-4">
            <div className="mb-2 text-[13px] font-semibold">Batteries for the next takeoff</div>
            <div className="flex flex-wrap gap-2">
              {live.batteries.map((b) => (
                <Chip key={b.value} active={chosen.includes(b.value)} onClick={() => setNext(chosen.includes(b.value) ? chosen.filter((x) => x !== b.value) : [...chosen, b.value])} label={`${b.label}, flown ${b.flown} times today`}>
                  <LevelDot level={b.status.level} /> {b.label}
                  {b.flown > 0 && <span className="text-[12px] opacity-70">×{b.flown}</span>}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {live.askCharge && (
          <div className="border-t border-[var(--certa-border)] px-6 py-4" role="group" aria-label="Battery left after landing">
            <div className="mb-2 text-[13px] font-semibold">Battery left? <span className="font-normal text-[var(--certa-muted)]">Optional, from the controller</span></div>
            <div className="flex flex-wrap gap-2">
              {CHARGES.map((p) => <Chip key={p} active={false} onClick={() => props.onCharge(p)}>{p}%</Chip>)}
              <Chip active={false} onClick={() => props.onCharge(null)}>Skip</Chip>
            </div>
          </div>
        )}
        <div className="border-t border-[var(--certa-border)] p-4">
          {airborne ? (
            <Button size="lg" className="h-16 w-full text-[18px]" icon={<PlaneLanding className="size-5" aria-hidden />} onClick={props.onLand}>Landed</Button>
          ) : (
            <Button size="lg" className="h-16 w-full bg-[var(--certa-current)] text-[18px] text-white" icon={<PlaneTakeoff className="size-5" aria-hidden />} onClick={() => (props.onTakeOff(chosen), setNext(null))}>Take off</Button>
          )}
        </div>
      </Card>

      <section aria-label="Mark an event" className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <Label>Mark an event</Label>
          {marked && <span className="text-[12.5px] font-semibold text-[var(--certa-current)]" role="status">Marked: {marked}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MARKER_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                props.onMark(k);
                setMarked(MARKER_LABEL[k]);
                setTimeout(() => setMarked(null), 2500);
              }}
              className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 text-left text-[13.5px] font-semibold hover:bg-[var(--certa-inset)] active:scale-[.98]"
            >
              {MARKER_ICON[k]} {MARKER_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-[var(--certa-muted)]">Timed and saved in the flight’s notes. Keep your eyes on the aircraft; let your observer tap these when you can.</p>
      </section>

      <Card className="mt-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label>Conditions watch</Label>
            <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold">
              {live.conditions.level && <span style={{ color: LEVEL_COLOR[live.conditions.level] }}><LevelIcon level={live.conditions.level} /></span>}
              {live.conditions.summary ?? (live.conditions.status === 'error' ? 'Not checked' : 'Checking…')}
            </div>
            <p className="mt-1 text-[13px] text-[var(--certa-muted)]">{live.conditions.error ?? (live.conditions.checked ? `${live.conditions.checked} · rechecks every 10 minutes while online` : 'Weather, airspace, TFRs and daylight at this spot')}</p>
            {live.conditions.daylight && <p className="mt-1 flex items-center gap-1.5 text-[13px]"><Sunset className="size-3.5" aria-hidden /> {live.conditions.daylight}</p>}
          </div>
          <Button variant="secondary" size="sm" loading={live.conditions.status === 'locating' || live.conditions.status === 'loading'} onClick={props.onCheckConditions}>Check now</Button>
        </div>
      </Card>

      {live.sorties.length > 0 && (
        <Card className="mt-5 overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
            <Label>Sorties</Label>
            <span className="tabular text-[13px] text-[var(--certa-muted)]">{live.totalAir} in the air</span>
          </div>
          <ul>
            {live.sorties.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-t border-[var(--certa-border)] px-5 py-3 text-[14px]">
                <span className="tabular w-6 font-semibold text-[var(--certa-muted)]">{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.when}{s.airborne && <span className="ml-2 text-[var(--certa-current)]">in flight</span>}</span>
                  <span className="block truncate text-[12.5px] text-[var(--certa-muted)]">{[s.batteries, s.charge].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tabular font-semibold">{s.duration}</span>
                <button type="button" aria-label={`Discard sortie ${s.n}`} className="rounded-full p-1.5 text-[var(--certa-muted)] hover:bg-[var(--certa-inset)] hover:text-[var(--certa-expired)]" onClick={() => confirm(`Discard sortie ${s.n}? It won’t be logged.`) && props.onDiscardSortie(s.id)}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {live.markers.length > 0 && (
            <div className="border-t border-[var(--certa-border)] px-5 py-3 text-[12.5px] text-[var(--certa-muted)]">
              {live.markers.map((m) => `${m.time} ${m.label}`).join(' · ')}
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" variant={airborne ? 'secondary' : 'primary'} disabled={airborne || live.landedCount === 0} onClick={() => setFinishing(true)}>
          {live.landedCount ? `Finish and log ${live.landedCount} ${live.landedCount === 1 ? 'flight' : 'flights'}` : 'Finish'}
        </Button>
        {airborne && <p className="text-center text-[12.5px] text-[var(--certa-muted)]">Land before finishing.</p>}
        <Button variant="ghost" onClick={() => confirm('Discard this session? Nothing from it will be logged.') && props.onDiscardSession()}>Discard session</Button>
        {!live.wakeLock && <p className="text-center text-[12px] text-[var(--certa-muted)]">This browser can’t keep the screen awake; the timer keeps counting if it locks.</p>}
      </div>

      <Dialog
        open={finishing}
        onClose={() => setFinishing(false)}
        title={`Log ${live.landedCount} ${live.landedCount === 1 ? 'flight' : 'flights'}`}
        description="Each sortie becomes a flight in the logbook with its batteries, times and event markers. Saved on this device first, so it’s safe offline."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFinishing(false)}>Back</Button>
            <Button loading={props.saving} onClick={() => props.onFinish(notes)}>Log flights</Button>
          </div>
        }
      >
        <Field label="Notes for every flight" hint="Optional, e.g. the job or anything unusual">
          {(a) => <textarea {...a} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-4 py-3 text-[15px]" />}
        </Field>
      </Dialog>

      <Dialog open={emergency} onClose={() => setEmergency(false)} title="Emergency" description="Fly the aircraft first. Then work down this card.">
        <EmergencyCard e={live.emergency} />
      </Dialog>
    </div>
  );
}

function EmergencyCard({ e }: { e: FlightModeLive['emergency'] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 text-[14px] leading-relaxed">
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--certa-expired)_40%,transparent)] bg-[color-mix(in_srgb,var(--certa-expired)_6%,var(--certa-surface))] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4" aria-hidden /> {e.site ?? 'Your location'}</div>
            {e.decimal ? (
              <>
                <div className="tabular mt-1 text-[17px] font-semibold" data-testid="fm-coords">{e.decimal}</div>
                <div className="tabular text-[13px] text-[var(--certa-muted)]">{e.dms}</div>
              </>
            ) : (
              <div className="mt-1 text-[13px] text-[var(--certa-muted)]">Location not checked yet. Use “Check now” in Conditions watch to get coordinates.</div>
            )}
          </div>
          {e.decimal && (
            <Button variant="secondary" size="sm" icon={<Copy className="size-4" aria-hidden />} onClick={() => void navigator.clipboard?.writeText(`${e.site ? e.site + ' — ' : ''}${e.decimal}`).then(() => setCopied(true))}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
        <a href="tel:911" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--certa-expired)] font-semibold text-white">
          <Phone className="size-4" aria-hidden /> Call 911
        </a>
        <p className="mt-2 text-[12.5px] text-[var(--certa-muted)]">{e.aircraft} · pilot {e.pilot}</p>
      </div>
      <Step icon={<RadioTower className="size-4" aria-hidden />} title="Lost link">
        Keep watching the aircraft. Move toward it and point the controller’s antennas at it. Most aircraft start their failsafe (usually Return to Home) on their own; if the link comes back, take control and bring it home. Note the time and its last position.
      </Step>
      <Step icon={<AlertTriangle className="size-4" aria-hidden />} title="Fly-away">
        Try Return to Home, then switch flight modes to regain control. Warn anyone under its path. If it could reach an airport or manned aircraft, call the nearest airport or air traffic control and tell them where it is heading and how long it can stay up.
      </Step>
      <Step icon={<Plane className="size-4" aria-hidden />} title="Manned aircraft nearby">
        Give way: descend and move away (14 CFR 107.37). Mark it with “Manned aircraft” so it’s in the log. A near miss can be reported to NASA’s Aviation Safety Reporting System.
      </Step>
      <Step icon={<Siren className="size-4" aria-hidden />} title="Injury or damage">
        Call 911 for anyone hurt. Report to the FAA on FAADroneZone within 10 days if anyone was seriously injured or lost consciousness, or if property other than the drone took more than $500 of damage (14 CFR 107.9).
      </Step>
      <p className="text-[12px] text-[var(--certa-muted)]">General guidance; your aircraft’s manual and your organization’s procedures come first.</p>
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 font-semibold">{icon} {title}</div>
      <p className="mt-1 text-[var(--certa-muted)]">{children}</p>
    </div>
  );
}

