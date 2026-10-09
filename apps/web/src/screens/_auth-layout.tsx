'use client';

import type { ReactNode } from 'react';
import { CertaLogo } from '@/components/brand';
import { Hub } from '@/components/hub';
import { Rise } from '@/components/motion';
import { Eyebrow } from '@/components/ui/text';

const NODES = [
  { label: 'Pilots', sub: 'Part 107 currency', level: 'green' as const },
  { label: 'Aircraft' },
  { label: 'Registrations', sub: 'Renewal in 23 days', level: 'amber' as const },
  { label: 'Batteries' },
  { label: 'Flight log', sub: 'Synced · tamper-evident', level: 'green' as const },
  { label: 'Audit trail' },
];

/** Split layout: brand + animated hub (wide screens), form panel. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="certa grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-[var(--certa-border)] bg-[var(--certa-canvas)] lg:flex lg:flex-col lg:gap-12 lg:p-14">
        <CertaLogo height={32} endorsed />
        <div className="space-y-6">
          <Rise>
            <Eyebrow live>Flight operations · Compliance</Eyebrow>
          </Rise>
          <Rise delay={0.08}>
            <h2 className="headline max-w-lg text-[44px] leading-[1.06] xl:text-[52px]">
              A clear record. <span className="text-[var(--certa-muted)]">Proof in under a minute.</span>
            </h2>
          </Rise>
          <Rise delay={0.16}>
            <p className="max-w-md text-[16px] leading-relaxed text-[var(--certa-muted)]">
              Every pilot, aircraft, and flight in one logbook — expirations tracked automatically, records you can hand to an auditor without hesitation.
            </p>
          </Rise>
        </div>
        <div className="-mx-6 mt-auto max-w-[540px]">
          <Hub nodes={NODES} />
        </div>
      </section>
      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <CertaLogo height={30} />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
