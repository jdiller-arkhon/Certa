'use client';

import type { SharedPacketScreenProps } from '@certa/contract';
import { FileDown, Fingerprint, Link2Off } from 'lucide-react';
import { CertaLogo } from '@/components/brand';
import { Rise } from '@/components/motion';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/feedback';
import { LEVEL_COLOR, LevelIcon, StatusBadge } from '@/components/ui/status';
import { Eyebrow, Label } from '@/components/ui/text';

export function SharedPacketScreen(props: SharedPacketScreenProps) {
  const d = props.data;
  return (
    <div className="certa min-h-dvh bg-[var(--certa-canvas)]">
      <header className="border-b border-[var(--certa-border)] bg-[var(--certa-surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <CertaLogo height={26} endorsed />
          {d && (
            <a
              href={props.pdfHref}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--certa-action)] px-4 text-[14px] font-semibold text-[var(--certa-onAction)] shadow-[var(--certa-shadow)] hover:opacity-90"
            >
              <FileDown className="size-4" aria-hidden /> Sealed PDF
            </a>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {props.loading ? (
          <Card className="p-6"><SkeletonRows rows={6} /></Card>
        ) : props.error || !d ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Link2Off className="size-8 text-[var(--certa-muted)]" aria-hidden />
            <h1 className="headline text-2xl">Link not available</h1>
            <p className="max-w-md text-[15px] text-[var(--certa-muted)]">{props.error ?? 'This link is no longer available.'}</p>
          </Card>
        ) : (
          <div className="space-y-6">
            <Rise>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-3">
                  <Eyebrow>Inspector packet · {d.packet.subject.type === 'pilot' ? 'Pilot' : 'Aircraft'}</Eyebrow>
                  <h1 className="headline text-[34px] leading-tight sm:text-[42px]">{d.packet.subject.name}</h1>
                  <p className="text-[14px] text-[var(--certa-muted)]">
                    {d.packet.organization} · records as of {d.packet.asOf} · {d.packet.ruleSet}
                  </p>
                </div>
                <StatusBadge status={d.packet.status} className="self-start sm:self-end" />
              </div>
            </Rise>

            <Rise delay={0.05}>
              <Card className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 sm:p-6">
                {d.packet.subject.facts.map(([k, v]) => (
                  <div key={k}>
                    <Label>{k}</Label>
                    <div className="mt-1 text-[15px] break-words">{v}</div>
                  </div>
                ))}
              </Card>
            </Rise>

            <Rise delay={0.1}>
              <Card className="overflow-hidden">
                <h2 className="border-b border-[var(--certa-border)] px-5 py-4 text-[15px] font-semibold">Records</h2>
                {d.packet.records.length ? (
                  <ul>
                    {d.packet.records.map((r, i) => (
                      <li key={i} className="flex flex-col gap-1 border-b border-[var(--certa-border)] px-5 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
                        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-semibold">
                          <span style={{ color: LEVEL_COLOR[r.level] }}><LevelIcon level={r.level} /></span>
                          {r.label}
                        </span>
                        <span className="text-[13px] text-[var(--certa-muted)] sm:w-52">{r.detail}</span>
                        <span className="tabular text-[13px] sm:w-24">{r.due ?? '—'}</span>
                        <span className="text-[13px] font-semibold sm:w-36 sm:text-right" style={{ color: LEVEL_COLOR[r.level] }}>{r.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">No records on file.</p>
                )}
              </Card>
            </Rise>

            <Rise delay={0.15}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Total flights', d.packet.activity.flights],
                  ['Flight time', d.packet.activity.flightTime],
                  ['Flights · 90 days', d.packet.activity.last90Flights],
                  ['Time · 90 days', d.packet.activity.last90FlightTime],
                ].map(([k, v]) => (
                  <Card key={String(k)} className="px-4 py-3.5">
                    <Label>{k}</Label>
                    <div className="tabular mt-1.5 text-[22px] font-semibold">{v}</div>
                  </Card>
                ))}
              </div>
            </Rise>

            {d.packet.recentFlights.length > 0 && (
              <Rise delay={0.2}>
                <Card className="overflow-x-auto">
                  <h2 className="border-b border-[var(--certa-border)] px-5 py-4 text-[15px] font-semibold">Recent flights</h2>
                  <table className="w-full text-left text-[14px]">
                    <thead className="text-[11px] tracking-[0.1em] text-[var(--certa-muted)] uppercase">
                      <tr>
                        <th className="px-5 py-2.5 font-semibold">Date (UTC)</th>
                        <th className="px-3 py-2.5 font-semibold">Duration</th>
                        <th className="px-3 py-2.5 font-semibold">{d.packet.subject.type === 'pilot' ? 'Aircraft' : 'Pilot'}</th>
                        <th className="px-3 py-2.5 font-semibold">Location</th>
                        <th className="px-5 py-2.5 font-semibold">Checklist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.packet.recentFlights.map((f, i) => (
                        <tr key={i} className="border-t border-[var(--certa-border)]">
                          <td className="tabular px-5 py-2.5">{f.date}</td>
                          <td className="tabular px-3 py-2.5">{f.duration}</td>
                          <td className="px-3 py-2.5">{f.with}</td>
                          <td className="px-3 py-2.5 text-[var(--certa-muted)]">{f.location ?? '—'}</td>
                          <td className="px-5 py-2.5">{f.checklist === 'complete' ? 'Complete' : f.checklist === 'incomplete' ? <span className="text-[var(--certa-warning)]">Incomplete</span> : <span className="text-[var(--certa-muted)]">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Rise>
            )}

            <Card className="space-y-3 p-5 text-[13px] text-[var(--certa-muted)]">
              <div className="flex items-start gap-2">
                <Fingerprint className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--certa-text)]">Seal</span> — matches the PDF when the records haven’t changed since it was printed.
                  <code className="mt-1 block truncate font-mono text-[12px] text-[var(--certa-text)]">{d.seal}</code>
                </div>
              </div>
              <p>Shared by {d.packet.organization}. This link stops working {d.expires}.</p>
              <p>{d.packet.disclaimer}</p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
