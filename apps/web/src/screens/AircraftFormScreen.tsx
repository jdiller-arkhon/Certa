'use client';

import type { AircraftFormScreenProps } from '@certa/contract';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { Label, PageHeader } from '@/components/ui/text';

type Values = AircraftFormScreenProps['values'];

export function AircraftFormScreen(props: AircraftFormScreenProps) {
  const [v, setV] = useState(props.values);
  useEffect(() => setV(props.values), [props.values]);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const err = (k: keyof Values) => props.fieldErrors[k];
  const noRid = v.remoteIdMethod === 'none' || v.remoteIdMethod === 'fria';
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Aircraft" title={props.mode === 'create' ? 'Add aircraft' : 'Edit aircraft'} description="Registration and Remote ID are checked against the active rule pack." />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      <Card className="p-5 sm:p-7">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(v);
          }}
        >
          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Aircraft</Label></legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Make" error={err('make')}>{(a) => <Input {...a} required placeholder="DJI" value={v.make} onChange={set('make')} />}</Field>
              <Field label="Model" error={err('model')}>{(a) => <Input {...a} required placeholder="Matrice 30T" value={v.model} onChange={set('model')} />}</Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Serial number" error={err('serialNumber')}>{(a) => <Input {...a} required className="tabular" value={v.serialNumber} onChange={set('serialNumber')} />}</Field>
              <Field label="Nickname" hint="Optional, e.g. “Falcon 1”" error={err('nickname')}>{(a) => <Input {...a} value={v.nickname} onChange={set('nickname')} />}</Field>
            </div>
          </fieldset>
          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Registration</Label></legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="FAA registration number" error={err('registrationNumber')}>{(a) => <Input {...a} className="tabular" placeholder="FA3…" value={v.registrationNumber} onChange={set('registrationNumber')} />}</Field>
              <Field label="Registration expires" error={err('registrationExpiresOn')}>{(a) => <Input {...a} type="date" value={v.registrationExpiresOn} onChange={set('registrationExpiresOn')} />}</Field>
            </div>
          </fieldset>
          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Remote ID</Label></legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Method" error={err('remoteIdMethod')} hint={noRid ? 'Without Remote ID the aircraft may only fly inside a FAA-recognized identification area.' : undefined}>
                {(a) => (
                  <Select {...a} value={v.remoteIdMethod} onChange={set('remoteIdMethod')}>
                    {props.remoteIdOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                )}
              </Field>
              {!noRid && <Field label="Remote ID serial" hint="Broadcast module or built-in serial" error={err('remoteIdSerial')}>{(a) => <Input {...a} className="tabular" value={v.remoteIdSerial} onChange={set('remoteIdSerial')} />}</Field>}
            </div>
          </fieldset>
          <fieldset className="space-y-5">
            <legend className="mb-1"><Label>Specifications</Label></legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Takeoff mass" hint="Including payload" error={err('takeoffMass')}>{(a) => <Input {...a} inputMode="decimal" suffix={props.massUnitLabel} value={v.takeoffMass} onChange={set('takeoffMass')} />}</Field>
              <Field label="Firmware" hint="Optional" error={err('firmwareVersion')}>{(a) => <Input {...a} className="tabular" value={v.firmwareVersion} onChange={set('firmwareVersion')} />}</Field>
            </div>
          </fieldset>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={props.onCancel}>Cancel</Button>
            <Button type="submit" arrow loading={props.saving}>{props.mode === 'create' ? 'Add aircraft' : 'Save changes'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
