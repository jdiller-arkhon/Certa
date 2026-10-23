'use client';

import { GLOSSARY } from '@certa/core';
import { BookOpen, CalendarClock, ClipboardCheck, Plane, Search, ShieldCheck, WifiOff } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, PageHeader } from '@/components/ui/text';

export interface HelpScreenProps {
  onOpen: (href: string) => void;
}

const HOW: { icon: ReactNode; title: string; body: ReactNode }[] = [
  {
    icon: <ShieldCheck className="size-5" aria-hidden />,
    title: 'Certa keeps you legal to fly',
    body: 'Add your FAA pilot certificate, your latest training date and your drones once. Certa works out what’s due and when, and tells you before anything runs out.',
  },
  {
    icon: <ClipboardCheck className="size-5" aria-hidden />,
    title: 'A quick check before every flight',
    body: 'When you log a flight, Certa runs a go / no-go check: your certificate and training, the drone’s registration and maintenance, battery health, weather and airspace. Green means nothing is in the way. You still make the call.',
  },
  {
    icon: <Plane className="size-5" aria-hidden />,
    title: 'Your logbook fills itself in',
    body: 'Each flight you log adds to your hours, your drone’s hours and battery cycles. Flights from Argus missions show up on their own; you just pick which drone you flew.',
  },
  {
    icon: <CalendarClock className="size-5" aria-hidden />,
    title: 'Reminders before things expire',
    body: 'Certa emails you and your organization’s managers 90, 30 and 7 days before training, registrations, insurance or waivers run out, and again if they lapse.',
  },
  {
    icon: <WifiOff className="size-5" aria-hidden />,
    title: 'Works in the field',
    body: 'No signal at the site? Log the flight anyway. Certa saves it on your phone and sends it when you’re back online.',
  },
];

const FIRST_FLIGHT: { title: string; body: string; href: string; action: string }[] = [
  { title: 'Add your pilot certificate', body: 'Open your pilot page and add your Remote Pilot Certificate. The issue date is printed on the card; the certificate number is optional.', href: '/pilots', action: 'Open pilots' },
  { title: 'Add your latest training', body: 'Add the date you passed the FAA knowledge test or the free online recurrent course. Certa counts 24 calendar months from it.', href: '/pilots', action: 'Open pilots' },
  { title: 'Add your drone', body: 'Make, model, serial number and FAA registration number. Every drone flown for work needs registering, whatever it weighs.', href: '/aircraft/new', action: 'Add drone' },
  { title: 'Log a flight', body: 'Tap Log a flight, pick the drone and the place, and Certa checks you’re good to go. Then enter how long you flew.', href: '/flights/new', action: 'Log a flight' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'What does red, amber and green mean?', a: 'Green: current, nothing to do. Amber: something is due soon, plan for it. Red: expired or missing, fix it before you fly. Tap any red or amber item to see how to fix it.' },
  { q: 'The go / no-go check says CAUTION. Can I fly?', a: 'Caution means something needs a second look, such as gusty wind or missing weather data. Read the reason, decide whether it’s safe, and note it on the flight. Certa never stops you logging a flight.' },
  { q: 'I fly for fun. Do I need Part 107?', a: 'Recreational flyers need the free TRUST certificate instead. Anything for work, pay or a business, even a single photo for a client, needs Part 107.' },
  { q: 'My drone is under 250 g. Does it need registering?', a: 'Not for recreational flying. Flown under Part 107 for work, every drone must be registered, whatever it weighs.' },
  { q: 'I logged a flight by mistake.', a: 'Open the flight from Flights, choose Edit to fix it, or delete it from the same page. Changes are kept in the audit log.' },
  { q: 'Who can see my records?', a: 'Owners, admins and chief pilots in your organization, and anyone you send an inspector packet link to. Links expire on the date you choose.' },
];

/** /help: how Certa works, the first flight step by step, common questions and the glossary. */
export function HelpScreen({ onOpen }: HelpScreenProps) {
  const [query, setQuery] = useState('');
  const terms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? GLOSSARY.filter((g) => `${g.term} ${g.short}`.toLowerCase().includes(q)) : GLOSSARY;
  }, [query]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Help" title="How Certa works" description="Everything you need to start logging flights, in plain language. New to drones for work? Start here." />

      <section aria-labelledby="help-how" className="mb-10">
        <h2 id="help-how" className="sr-only">
          What Certa does
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {HOW.map((h) => (
            <li key={h.title}>
              <Card className="h-full p-5">
                <div className="mb-2 flex items-center gap-2.5 text-[var(--certa-text)]">
                  {h.icon}
                  <h3 className="text-[15px] font-semibold">{h.title}</h3>
                </div>
                <p className="text-[14px] leading-relaxed text-[var(--certa-muted)]">{h.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="help-first" className="mb-10">
        <Label>Your first flight</Label>
        <h2 id="help-first" className="mt-1 mb-4 text-[22px] font-semibold tracking-tight">
          Four steps, about five minutes
        </h2>
        <Card className="overflow-hidden">
          <ol className="divide-y divide-[var(--certa-border)]">
            {FIRST_FLIGHT.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--certa-border)] text-[14px] font-semibold" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-0.5 text-[14px] text-[var(--certa-muted)]">{s.body}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onOpen(s.href)} arrow>
                  {s.action}
                </Button>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section aria-labelledby="help-faq" className="mb-10">
        <Label>Common questions</Label>
        <h2 id="help-faq" className="mt-1 mb-4 text-[22px] font-semibold tracking-tight">
          Questions new pilots ask
        </h2>
        <Card className="divide-y divide-[var(--certa-border)] overflow-hidden">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
                <span className="mr-2 inline-block text-[var(--certa-muted)] transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                {f.q}
              </summary>
              <p className="mt-2 pl-5 text-[14px] leading-relaxed text-[var(--certa-muted)]">{f.a}</p>
            </details>
          ))}
        </Card>
      </section>

      <section aria-labelledby="help-glossary" className="mb-6">
        <Label>Glossary</Label>
        <div className="mt-1 mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="help-glossary" className="text-[22px] font-semibold tracking-tight">
            Drone words, explained
          </h2>
          <label className="relative block sm:w-64">
            <span className="sr-only">Search the glossary</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--certa-muted)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. LAANC"
              className="w-full rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] py-2 pr-3 pl-9 text-[14px]"
            />
          </label>
        </div>
        <Card className="overflow-hidden">
          {terms.length ? (
            <dl className="divide-y divide-[var(--certa-border)]">
              {terms.map((g) => (
                <div key={g.id} id={`term-${g.id}`} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[13rem_1fr] sm:gap-4">
                  <dt className="text-[15px] font-semibold">{g.term}</dt>
                  <dd className="text-[14px] leading-relaxed text-[var(--certa-muted)]">{g.short}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="flex items-center gap-2 px-5 py-6 text-[14px] text-[var(--certa-muted)]">
              <BookOpen className="size-4" aria-hidden /> No term matches “{query}”.
            </p>
          )}
        </Card>
      </section>
      <p className="text-[13px] text-[var(--certa-muted)]">Certa is a record-keeping aid. The FAA rules (14 CFR Part 107) and your remote pilot in command decide whether a flight is safe and legal.</p>
    </div>
  );
}
