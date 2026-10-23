'use client';

import type { PlatformOverviewScreenProps } from '@certa/contract';
import { ArrowRight, Download } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Banner, SkeletonRows } from '@/components/ui/feedback';
import { Panel } from '@/components/ui/panel';
import { LEVEL_COLOR } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { HoursChart, KpiGrid, PeriodPicker, ReadinessBar } from './_platform';

export function PlatformOverviewScreen(props: PlatformOverviewScreenProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Arkhon platform console"
        title="Overview"
        description="Every pilot and organization on Certa, at a glance. Click a figure to see who’s behind it."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} loading={props.downloading === 'monthly'} onClick={() => props.onDownload('monthly')}>
              Monthly summary CSV
            </Button>
            <Button variant="secondary" arrow onClick={() => props.onNavigate('/platform/reports')}>
              All exports
            </Button>
          </>
        }
      />
      {props.error && <Banner tone="error" onRetry={props.onRetry}>{props.error}</Banner>}

      {props.state === 'loading' ? (
        <SkeletonRows rows={6} />
      ) : props.state === 'ready' ? (
        <>
          <section aria-label="Right now" className="space-y-3">
            <KpiGrid items={props.kpis} onNavigate={props.onNavigate} />
          </section>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="headline text-[22px]">Activity · {props.period.label}</h2>
            <PeriodPicker period={props.period} presets={props.presets} onPreset={props.onPreset} onCustom={props.onCustom} />
          </div>
          <KpiGrid items={props.periodStats} onNavigate={props.onNavigate} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Panel label="Flight hours by month" meta={<span>Last 12 months · UTC</span>} bodyClassName="px-3 pt-4 pb-2 sm:px-5">
              <HoursChart months={props.months} caption="Flight hours by month, last 12 months" />
            </Panel>
            <Panel label="Pilot readiness" meta={<button type="button" className="hover:underline" onClick={() => props.onNavigate('/platform/pilots')}>All pilots</button>}>
              <ReadinessBar parts={props.readiness} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel label={`Most hours · ${props.period.label}`}>
              {props.topPilots.length ? (
                <ol className="divide-y divide-[var(--certa-border)]">
                  {props.topPilots.map((p, i) => (
                    <li key={p.key}>
                      <button type="button" onClick={() => props.onNavigate(p.href)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--certa-inset)]">
                        <span className="tabular w-5 text-[13px] text-[var(--certa-muted)]">{i + 1}</span>
                        <Avatar user={{ initials: p.initials, name: p.name }} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{p.name}</span>
                          <span className="block truncate text-[13px] text-[var(--certa-muted)]">{p.orgName}</span>
                        </span>
                        <span className="text-right">
                          <span className="tabular block text-[15px] font-semibold">{p.hours}</span>
                          <span className="tabular block text-[12px] text-[var(--certa-muted)]">{p.flights}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-6 text-[14px] text-[var(--certa-muted)]">No flights in this period.</p>
              )}
            </Panel>

            <Panel label="Organizations" meta={<span>{props.organizations.length}</span>}>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-[12px] text-[var(--certa-muted)]">
                      <th className="px-5 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 text-right font-medium">Pilots</th>
                      <th className="px-3 py-2.5 text-right font-medium">Readiness</th>
                      <th className="px-5 py-2.5 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--certa-border)]">
                    {props.organizations.map((o) => (
                      <tr key={o.id}>
                        <td className="max-w-[200px] truncate px-5 py-2.5 font-medium">{o.name}</td>
                        <td className="tabular px-3 py-2.5 text-right">{o.pilots}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="tabular inline-flex gap-2 text-[13px]" aria-label={`${o.readiness.green} cleared, ${o.readiness.amber} attention, ${o.readiness.red} not cleared`}>
                            {(['green', 'amber', 'red'] as const).map((l) => (
                              <span key={l} className="inline-flex items-center gap-1" style={{ color: o.readiness[l] ? LEVEL_COLOR[l] : 'var(--certa-muted)' }}>
                                <span aria-hidden className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[l] }} />
                                {o.readiness[l]}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="tabular px-5 py-2.5 text-right">{o.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[var(--certa-muted)]">
            <span>Updated {props.generatedAt}. Hours count Certa flights and Argus mission flights; prior experience from other apps isn’t included.</span>
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-[var(--certa-text)] hover:underline" onClick={() => props.onNavigate('/platform/pilots?view=help')}>
              Pilots who need a hand <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
