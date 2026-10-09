'use client';

import type { OrgSettingsScreenProps } from '@certa/contract';
import { Check, Save } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Rise } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { PageHeader } from '@/components/ui/text';

function Section({ title, description, children, delay = 0 }: { title: string; description: string; children: React.ReactNode; delay?: number }) {
  return (
    <Rise delay={delay}>
      <Card className="grid gap-6 p-6 md:grid-cols-[260px_1fr] md:gap-10 md:p-8">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--certa-muted)]">{description}</p>
        </div>
        <div className="space-y-5">{children}</div>
      </Card>
    </Rise>
  );
}

export function OrgSettingsScreen(props: OrgSettingsScreenProps) {
  const [v, setV] = useState(props.values);
  const [saved, setSaved] = useState(false);
  useEffect(() => setV(props.values), [props.values]);
  const dirty = JSON.stringify(v) !== JSON.stringify(props.values);
  useEffect(() => {
    if (!props.saving && saved) {
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [props.saving, saved]);
  const unit = (k: keyof typeof v.units, label: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Segmented label={label} value={v.units[k]} options={props.options[k]} onChange={(x) => props.canEdit && setV({ ...v, units: { ...v.units, [k]: x } })} />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(true);
        props.onSave(v);
      }}
    >
      <PageHeader eyebrow="Settings" title="Organization" description="How your organization appears on records and how values are displayed. Everything is stored in SI units; this only changes what you see." />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      <div className="space-y-6">
        <Section title="Profile" description="Shown in the app and on exported logbooks and compliance packets.">
          <Field label="Organization name">{(a) => <Input {...a} disabled={!props.canEdit} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Time zone" hint="Used for “today” in readiness and for due dates. Flight times always show in the flight location’s zone.">
            {(a) => (
              <Select {...a} disabled={!props.canEdit} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
                {props.options.timezones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </Section>
        <Section title="Units" description="Display units for altitude, distance, speed, mass, and temperature." delay={0.06}>
          <div className="grid gap-5 sm:grid-cols-2">
            {unit('length', 'Length')}
            {unit('speed', 'Speed')}
            {unit('mass', 'Mass')}
            {unit('temperature', 'Temperature')}
          </div>
        </Section>
        <Section title="Regulations" description="The rule pack used for currency, expiry, and reporting deadlines." delay={0.12}>
          <Field label="Jurisdiction">
            {(a) => (
              <Select {...a} disabled value={v.defaultJurisdiction}>
                {props.options.jurisdictions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </Section>
      </div>
      {props.canEdit && (
        <AnimatePresence>
          {(dirty || props.saving || saved) && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 lg:bottom-8 lg:pl-[272px]"
            >
              <div className="flex items-center gap-4 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] py-2 pr-2 pl-5 shadow-[var(--certa-shadow-lg)]">
                <span className="text-sm font-medium">
                  {saved && !props.saving && !dirty ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--certa-current)' }}>
                      <Check className="size-4" aria-hidden /> Saved
                    </span>
                  ) : (
                    'Unsaved changes'
                  )}
                </span>
                {dirty && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setV(props.values)}>Discard</Button>
                    <Button type="submit" size="sm" loading={props.saving} icon={<Save className="size-4" aria-hidden />}>Save</Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </form>
  );
}
