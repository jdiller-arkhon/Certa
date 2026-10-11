'use client';

import type { PilotFormScreenProps } from '@certa/contract';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';

export function PilotFormScreen(props: PilotFormScreenProps) {
  const [v, setV] = useState(props.values);
  useEffect(() => setV(props.values), [props.values]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Pilots"
        title={props.mode === 'create' ? 'Add pilot' : 'Edit pilot'}
        description="Add certificates and recurrent training on the pilot’s page after saving."
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      <Card className="p-5 sm:p-7">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(v);
          }}
        >
          <Field label="Full name" error={props.fieldErrors.displayName}>
            {(a) => <Input {...a} required autoComplete="name" value={v.displayName} onChange={set('displayName')} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" hint="Optional" error={props.fieldErrors.email}>
              {(a) => <Input {...a} type="email" autoComplete="email" value={v.email} onChange={set('email')} />}
            </Field>
            <Field label="Phone" hint="Optional" error={props.fieldErrors.phone}>
              {(a) => <Input {...a} type="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} />}
            </Field>
          </div>
          <Field label="Remote pilot certificate number" hint="From the FAA airman certificate (Part 107)" error={props.fieldErrors.certificateNumber}>
            {(a) => <Input {...a} className="tabular" value={v.certificateNumber} onChange={set('certificateNumber')} />}
          </Field>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={props.onCancel}>Cancel</Button>
            <Button type="submit" arrow loading={props.saving}>{props.mode === 'create' ? 'Add pilot' : 'Save changes'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
