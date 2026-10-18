'use client';

import type { PriorExperienceInput, PriorExperienceViewModel } from '@certa/contract';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';

/** Apps pilots commonly keep their history in; free text is accepted too. */
const SOURCES = ['DJI Fly', 'DJI Pilot 2', 'AirData UAV', 'DroneLogbook', 'Aloft', 'Autel Explorer', 'Skydio', 'Litchi', 'Paper logbook'];

type Form = { source: string; flights: string; missions: string; hours: string; minutes: string; asOf: string; notes: string };

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toForm = (x?: PriorExperienceViewModel): Form =>
  x
    ? { source: x.source, flights: String(x.flights), missions: String(x.missions), hours: String(Math.floor(x.flightSeconds / 3600)), minutes: String(Math.round((x.flightSeconds % 3600) / 60)), asOf: x.asOf.iso.slice(0, 10), notes: x.notes ?? '' }
    : { source: '', flights: '', missions: '', hours: '', minutes: '', asOf: localToday(), notes: '' };

const whole = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Add or edit one prior-experience entry: totals a pilot carried over from another app.
 * `entry` set = edit (with Remove); unset = add.
 */
export function PriorExperienceDialog({
  open,
  entry,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean;
  entry?: PriorExperienceViewModel;
  onClose: () => void;
  onSave: (input: PriorExperienceInput) => void;
  onRemove?: () => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(entry));
  const [key, setKey] = useState(entry?.id ?? 'new');
  // Reset the form when the dialog switches to a different entry.
  if ((entry?.id ?? 'new') !== key) {
    setKey(entry?.id ?? 'new');
    setForm(toForm(entry));
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const today = localToday();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry ? `Prior experience · ${entry.source}` : 'Add prior experience'}
      description="Totals from another app or logbook, as shown there today. They count toward all-time totals, not the last-90-days figures."
      footer={
        <>
          {entry && onRemove && <Button variant="danger" onClick={onRemove}>Remove</Button>}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="prior-form" arrow>{entry ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <form
        id="prior-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            source: form.source.trim(),
            flights: whole(form.flights),
            missions: whole(form.missions),
            flightSeconds: whole(form.hours) * 3600 + Math.min(59, whole(form.minutes)) * 60,
            asOf: form.asOf,
            notes: form.notes.trim() || null,
          });
          if (!entry) setForm(toForm());
        }}
      >
        <Field label="App or logbook" hint="Where these numbers come from">
          {(a) => (
            <>
              <Input {...a} list="prior-sources" required maxLength={100} placeholder="e.g. DJI Fly" value={form.source} onChange={set('source')} />
              <datalist id="prior-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Flights">{(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} required className="tabular" value={form.flights} onChange={set('flights')} />}</Field>
          <Field label="Missions" hint="0 if the app doesn't track them">{(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} className="tabular" value={form.missions} onChange={set('missions')} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Flight time · hours">{(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} className="tabular" value={form.hours} onChange={set('hours')} suffix="h" />}</Field>
          <Field label="Minutes">{(a) => <Input {...a} type="number" inputMode="numeric" min={0} max={59} step={1} className="tabular" value={form.minutes} onChange={set('minutes')} suffix="min" />}</Field>
        </div>
        <Field label="As of" hint="The date you read these totals">{(a) => <Input {...a} type="date" required max={today} value={form.asOf} onChange={set('asOf')} />}</Field>
        <Field label="Notes" hint="Optional">{(a) => <Input {...a} maxLength={2000} value={form.notes} onChange={set('notes')} />}</Field>
      </form>
    </Dialog>
  );
}
