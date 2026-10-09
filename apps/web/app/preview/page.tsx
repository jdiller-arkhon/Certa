'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { CertaMark } from '@/components/hub';
import { Rise, Stagger, StaggerItem } from '@/components/motion';
import { Card } from '@/components/ui/card';
import { Eyebrow, Label } from '@/components/ui/text';
import { SCENARIOS, SCREENS } from '@/preview/registry';

export default function PreviewIndex() {
  const groups = ['Auth', 'App', 'Admin'] as const;
  return (
    <div className="certa min-h-dvh">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-10 sm:py-16">
        <div className="flex items-center gap-2.5">
          <CertaMark className="size-7" />
          <span className="text-[17px] font-bold tracking-[0.2em]">CERTA</span>
        </div>
        <Rise className="mt-12 space-y-4">
          <Eyebrow live>Screen preview · fixtures only</Eyebrow>
          <h1 className="headline text-[40px] leading-[1.06] sm:text-[52px]">Inspect every screen.</h1>
          <p className="max-w-2xl text-[17px] leading-relaxed text-[var(--certa-muted)]">
            Every screen rendered from the contract fixtures — no backend, no real data. Switch scenario, state, and theme from the toolbar on each screen. Scenarios: {SCENARIOS.join(', ')}.
          </p>
        </Rise>
        {groups.map((g) => (
          <section key={g} className="mt-12">
            <Label>{g}</Label>
            <Stagger gap={0.05} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SCREENS.filter((s) => s.group === g).map((s) => (
                <StaggerItem key={s.id}>
                  <Link href={`/preview/${s.id}${s.shell ? '?scenario=company' : ''}`} className="block">
                    <Card interactive className="group p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-[16px] font-semibold">{s.title}</h2>
                          <code className="mt-1 block font-mono text-[12px] text-[var(--certa-muted)]">{s.route}</code>
                        </div>
                        <ArrowUpRight aria-hidden className="size-5 text-[var(--certa-muted)] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        ))}
      </div>
    </div>
  );
}
