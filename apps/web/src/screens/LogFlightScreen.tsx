'use client';

import type { LogFlightScreenProps } from '@certa/contract';
import { History, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/components/cn';
import { GoNoGoPanel } from '@/components/go-no-go';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LevelDot } from '@/components/ui/status';
import { Label, PageHeader } from '@/components/ui/text';
import { TextArea, num } from './_parts';

const DURATIONS = [10, 15, 20, 25, 30, 45];

/** ISO instant → value for <input type="datetime-local"> in the device's time zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
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

export function LogFlightScreen(props: LogFlightScreenProps) {
  const d = props.defaults;
  const [pilotId, setPilotId] = useState(d.pilotId);
  const [aircraftId, setAircraftId] = useState(d.aircraftId ?? '');
  const [batteryIds, setBatteryIds] = useState<string[]>(d.batteryIds);
  const [location, setLocation] = useState(props.siteOptions.find((s) => s.recent)?.value ?? '');
  const [operationType, setOperationType] = useState(d.operationType);
  const [takeoff, setTakeoff] = useState(() => toLocalInput(d.takeoffAt));
  const [minutes, setMinutes] = useState(d.durationMinutes ? String(d.durationMinutes) : '');
  const [altitude, setAltitude] = useState('');
  const [notes, setNotes] = useState('');

  // Report selection changes so the host can recompute the go / no-go.
  const onSel = useRef(props.onSelectionChange);
  onSel.current = props.onSelectionChange;
  useEffect(() => {
    onSel.current({ pilotId, aircraftId: aircraftId || null, batteryIds });
  }, [pilotId, aircraftId, batteryIds]);

  const sameAsLast = () => {
    setPilotId(d.pilotId);
    setAircraftId(d.aircraftId ?? '');
    setBatteryIds(d.batteryIds);
    setOperationType(d.operationType);
    if (d.durationMinutes) setMinutes(String(d.durationMinutes));
    props.onSameAsLast();
  };
  const toggleBattery = (id: string) => setBatteryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const mins = num(minutes);
  const [allBatteries, setAllBatteries] = useState(false);
  const model = props.aircraftOptions.find((o) => o.value === aircraftId)?.model;
  const fitting = props.batteryOptions.filter((b) => !model || !b.aircraftModel || b.aircraftModel === model || batteryIds.includes(b.value));
  const shownBatteries = allBatteries ? props.batteryOptions : fitting;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Logbook"
        title="Log a flight"
        description="Works offline. Flights sync when you’re back in coverage."
        actions={props.hasLastFlight && <Button variant="secondary" icon={<History className="size-4" aria-hidden />} onClick={sameAsLast}>Same as last</Button>}
      />
      <Banners>
        {props.error && <Banner key="e" tone="error">{props.error}</Banner>}
        {props.warnings.length > 0 && !props.preflight && (
          <Banner key="w" tone="warning">{props.warnings.map((w) => w.text).join(' · ')}</Banner>
        )}
      </Banners>

      <form
        className="grid gap-6 lg:grid-cols-[1fr_300px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!aircraftId || !mins || mins <= 0) return;
          const t = new Date(takeoff);
          props.onSubmit({
            pilotId,
            aircraftId,
            batteryIds,
            siteId: null,
            operationType,
            takeoffAt: t.toISOString(),
            landingAt: new Date(t.getTime() + mins * 60_000).toISOString(),
            maxAltitude: num(altitude),
            locationName: location.trim() || null,
            notes: notes.trim() || null,
          });
        }}
      >
        <Card className="space-y-6 p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Pilot in command" error={props.fieldErrors.pilotId}>
              {(a) => (
                <Select {...a} required value={pilotId} onChange={(e) => setPilotId(e.target.value)}>
                  {props.pilotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}{o.status.level !== 'green' ? ` — ${o.status.label}` : ''}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Aircraft" error={props.fieldErrors.aircraftId}>
              {(a) => (
                <Select {...a} required value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
                  <option value="" disabled>Choose aircraft</option>
                  {props.aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}{o.status.level !== 'green' ? ` — ${o.status.label}` : ''}</option>)}
                </Select>
              )}
            </Field>
          </div>

          {props.batteryOptions.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Batteries</legend>
              <div className="flex flex-wrap gap-2">
                {shownBatteries.map((b) => (
                  <Chip key={b.value} active={batteryIds.includes(b.value)} onClick={() => toggleBattery(b.value)} label={`${b.label}, ${b.status.label}`}>
                    <LevelDot level={b.status.level} /> {b.label}
                  </Chip>
                ))}
                {fitting.length < props.batteryOptions.length && (
                  <button type="button" className="h-10 px-2 text-[13px] font-semibold text-[var(--certa-muted)] underline-offset-4 hover:underline" onClick={() => setAllBatteries((v) => !v)}>
                    {allBatteries ? `Only ${model} batteries` : `Show all ${props.batteryOptions.length}`}
                  </button>
                )}
              </div>
              {!shownBatteries.length && <p className="text-[13px] text-[var(--certa-muted)]">No batteries on file for this aircraft.</p>}
            </fieldset>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Takeoff" error={props.fieldErrors.takeoffAt}>{(a) => <Input {...a} type="datetime-local" required value={takeoff} onChange={(e) => setTakeoff(e.target.value)} />}</Field>
            <Field label="Duration" error={props.fieldErrors.landingAt}>{(a) => <Input {...a} inputMode="numeric" required suffix="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
          </div>
          <div className="-mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick duration">
            {DURATIONS.map((m) => (
              <Chip key={m} active={mins === m} onClick={() => setMinutes(String(m))}>{m} min</Chip>
            ))}
          </div>

          <Field label="Location">
            {(a) => <Input {...a} list="recent-sites" placeholder="Site name" value={location} onChange={(e) => setLocation(e.target.value)} />}
          </Field>
          <datalist id="recent-sites">{props.siteOptions.map((s) => <option key={s.value} value={s.value} />)}</datalist>
          {props.siteOptions.some((s) => s.recent) && (
            <div className="-mt-3 flex flex-wrap gap-2" role="group" aria-label="Recent sites">
              {props.siteOptions.filter((s) => s.recent).map((s) => (
                <Chip key={s.value} active={location === s.value} onClick={() => setLocation(s.value)}>
                  <MapPin className="size-3.5" aria-hidden /> {s.label}
                </Chip>
              ))}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Operation">
              {(a) => (
                <Select {...a} value={operationType} onChange={(e) => setOperationType(e.target.value)}>
                  {props.operationTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Max altitude" hint="Above ground level, optional" error={props.fieldErrors.maxAltitudeAglM}>
              {(a) => <Input {...a} inputMode="numeric" suffix={props.altitudeUnitLabel} value={altitude} onChange={(e) => setAltitude(e.target.value)} />}
            </Field>
          </div>
          <Field label="Notes" hint="Optional">{(a) => <TextArea {...a} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {props.preflight ? (
            <GoNoGoPanel result={props.preflight} />
          ) : (
            <Card className="p-5 text-[14px] text-[var(--certa-muted)]">
              <Label>Pre-flight check</Label>
              <p className="mt-2">Choose a pilot and aircraft to check them against records on file.</p>
            </Card>
          )}
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" arrow loading={props.saving} disabled={!aircraftId || !mins}>Log flight</Button>
            <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
