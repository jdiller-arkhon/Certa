'use client';

import type { MissionFormScreenProps } from '@certa/contract';
import { Check, LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LevelDot } from '@/components/ui/status';
import { Label, PageHeader } from '@/components/ui/text';
import { TextArea, num } from './_parts';

/** ISO instant → value for <input type="datetime-local"> in the device's zone, and back. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

type Option = MissionFormScreenProps['pilotOptions'][number];

/** A toggleable pill with the option's readiness dot. */
function Pick({ option, on, onToggle, disabled }: { option: Option; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      title={option.status.label}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--certa-focus)] disabled:opacity-45',
        on ? 'border-[var(--certa-action)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] bg-[var(--certa-surface)] hover:bg-[var(--certa-inset)]',
      )}
    >
      {on ? <Check className="size-4" aria-hidden /> : <LevelDot level={option.status.level} />}
      {option.label}
      <span className="sr-only">, {option.status.label}</span>
    </button>
  );
}

export function MissionFormScreen(props: MissionFormScreenProps) {
  const d = props.defaults;
  const [name, setName] = useState(d.name);
  const [purpose, setPurpose] = useState(d.purpose ?? '');
  const [start, setStart] = useState(toLocal(d.plannedStart));
  const [end, setEnd] = useState(toLocal(d.plannedEnd));
  const [locationName, setLocationName] = useState(d.locationName ?? '');
  const [lat, setLat] = useState(d.location ? String(d.location.lat) : '');
  const [lon, setLon] = useState(d.location ? String(d.location.lon) : '');
  const [altitude, setAltitude] = useState(d.maxAltitude != null ? String(d.maxAltitude) : '');
  const [operationType, setOperationType] = useState(d.operationType);
  const [deliverables, setDeliverables] = useState(d.deliverables ?? '');
  const [picId, setPicId] = useState(d.picId ?? '');
  const [observerIds, setObserverIds] = useState<string[]>(d.observerIds);
  const [aircraftIds, setAircraftIds] = useState<string[]>(d.aircraftIds);
  const [authorizationIds, setAuthorizationIds] = useState<string[]>(d.authorizationIds);
  const [locating, setLocating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const useHere = () => {
    if (!('geolocation' in navigator)) return setLocalError('This device can’t share its location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(Math.round(pos.coords.latitude * 1e5) / 1e5));
        setLon(String(Math.round(pos.coords.longitude * 1e5) / 1e5));
        setLocating(false);
      },
      () => {
        setLocalError('Location permission is needed to use where you are.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = (status: 'draft' | 'planned') => {
    setLocalError(null);
    const la = num(lat);
    const lo = num(lon);
    if ((lat || lon) && (la == null || lo == null || Math.abs(la) > 90 || Math.abs(lo) > 180)) return setLocalError('Enter a latitude between −90 and 90 and a longitude between −180 and 180, or leave both empty.');
    if (start && end && new Date(end) <= new Date(start)) return setLocalError('The end must be after the start.');
    props.onSubmit({
      name: name.trim(),
      purpose: purpose.trim() || null,
      plannedStart: fromLocal(start),
      plannedEnd: fromLocal(end),
      locationName: locationName.trim() || null,
      location: la != null && lo != null ? { lat: la, lon: lo } : null,
      maxAltitude: num(altitude),
      operationType,
      deliverables: deliverables.trim() || null,
      picId: picId || null,
      observerIds: observerIds.filter((id) => id !== picId),
      aircraftIds,
      authorizationIds,
      status,
    });
  };
  const error = localError ?? props.error;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Missions" title={props.mode === 'create' ? 'Plan a mission' : 'Edit mission'} description="Everything is optional except the name. Readiness is checked against the date you set." />
      <Banners>{error && <Banner key="e" tone="error">{error}</Banner>}</Banners>
      <Card className="p-5 sm:p-7">
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit('planned');
          }}
        >
          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Mission</Label></legend>
            <Field label="Name" error={props.fieldErrors.name}>{(a) => <Input {...a} required maxLength={200} placeholder="Substation thermal survey" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Purpose and brief" hint="Optional — what the job is and anything the crew should know">{(a) => <TextArea {...a} value={purpose} onChange={(e) => setPurpose(e.target.value)} />}</Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts" error={props.fieldErrors.plannedStart}>{(a) => <Input {...a} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
              <Field label="Ends" error={props.fieldErrors.plannedEnd}>{(a) => <Input {...a} type="datetime-local" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Operation">
                {(a) => (
                  <Select {...a} value={operationType} onChange={(e) => setOperationType(e.target.value)}>
                    {props.operationTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Max altitude" hint="Above ground level" error={props.fieldErrors.maxAltitudeAglM}>{(a) => <Input {...a} inputMode="numeric" suffix={props.altitudeUnitLabel} value={altitude} onChange={(e) => setAltitude(e.target.value)} />}</Field>
            </div>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Where</Label></legend>
            <Field label="Location name">
              {(a) => (
                <>
                  <Input {...a} list="mission-sites" placeholder="Henderson substation" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                  <datalist id="mission-sites">{props.siteOptions.map((s) => <option key={s.value} value={s.value} />)}</datalist>
                </>
              )}
            </Field>
            <div className="grid items-end gap-5 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Latitude">{(a) => <Input {...a} inputMode="decimal" className="tabular" placeholder="39.92080" value={lat} onChange={(e) => setLat(e.target.value)} />}</Field>
              <Field label="Longitude">{(a) => <Input {...a} inputMode="decimal" className="tabular" placeholder="-104.85860" value={lon} onChange={(e) => setLon(e.target.value)} />}</Field>
              <Button variant="secondary" loading={locating} icon={<LocateFixed className="size-4" aria-hidden />} onClick={useHere}>Use where I am</Button>
            </div>
            <p className="-mt-2 text-[13px] text-[var(--certa-muted)]">Coordinates let the mission page check airspace, TFRs and weather at the site.</p>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Crew</Label></legend>
            <Field label="Pilot in command" error={props.fieldErrors.crew}>
              {(a) => (
                <Select {...a} value={picId} onChange={(e) => setPicId(e.target.value)}>
                  <option value="">Not assigned yet</option>
                  {props.pilotOptions.map((p) => <option key={p.value} value={p.value}>{p.label} — {p.status.label}</option>)}
                </Select>
              )}
            </Field>
            {props.pilotOptions.length > 1 && (
              <div>
                <div className="mb-2 text-[14px] font-semibold" id="observers-label">Visual observers</div>
                <div role="group" aria-labelledby="observers-label" className="flex flex-wrap gap-2">
                  {props.pilotOptions.filter((p) => p.value !== picId).map((p) => (
                    <Pick key={p.value} option={p} on={observerIds.includes(p.value)} onToggle={() => toggle(observerIds, setObserverIds, p.value)} />
                  ))}
                </div>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1"><Label>Aircraft</Label></legend>
            {props.aircraftOptions.length ? (
              <div role="group" aria-label="Aircraft" className="flex flex-wrap gap-2">
                {props.aircraftOptions.map((o) => <Pick key={o.value} option={o} on={aircraftIds.includes(o.value)} onToggle={() => toggle(aircraftIds, setAircraftIds, o.value)} />)}
              </div>
            ) : (
              <p className="text-[14px] text-[var(--certa-muted)]">No aircraft in the fleet yet.</p>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1"><Label>Authorizations</Label></legend>
            {props.authorizationOptions.length ? (
              <ul className="divide-y divide-[var(--certa-border)] rounded-xl border border-[var(--certa-border)]">
                {props.authorizationOptions.map((o) => (
                  <li key={o.value}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[14px]">
                      <input type="checkbox" className="size-4 accent-[var(--certa-action)]" checked={authorizationIds.includes(o.value)} onChange={() => toggle(authorizationIds, setAuthorizationIds, o.value)} />
                      <span className="min-w-0 flex-1">{o.label}</span>
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--certa-muted)]"><LevelDot level={o.status.level} />{o.status.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[var(--certa-muted)]">None recorded. Add LAANC approvals and waivers under Upkeep › Authorizations.</p>
            )}
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Deliverables</Label></legend>
            <Field label="What the client gets" hint="Optional">{(a) => <TextArea {...a} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} />}</Field>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={props.onCancel}>Cancel</Button>
            {props.mode === 'create' && (
              <Button variant="secondary" disabled={props.saving} onClick={() => name.trim() && submit('draft')}>Save as draft</Button>
            )}
            <Button type="submit" arrow loading={props.saving}>{props.mode === 'create' ? 'Plan mission' : 'Save changes'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
