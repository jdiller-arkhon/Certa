'use client';

import type { PlatformReportsScreenProps } from '@certa/contract';
import { CalendarRange, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Banner, Banners } from '@/components/ui/feedback';
import { Panel } from '@/components/ui/panel';
import { PageHeader } from '@/components/ui/text';
import { PeriodPicker } from './_platform';

export function PlatformReportsScreen(props: PlatformReportsScreenProps) {
  return (
    <div>
      <PageHeader
        eyebrow="Arkhon platform console"
        title="Reports & exports"
        description="Metrics across every organization as CSV, ready for Excel, Google Sheets or your BI tool. Every download is recorded in admin activity."
      />
      <Banners>{props.error && <Banner key="e" tone="error" onDismiss={props.onDismissError}>{props.error}</Banner>}</Banners>
      <div className="mb-6 flex flex-col gap-3 rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          <CalendarRange className="size-4 text-[var(--certa-muted)]" aria-hidden /> Period: {props.period.label}
        </span>
        <PeriodPicker period={props.period} presets={props.presets} onPreset={props.onPreset} onCustom={props.onCustom} />
      </div>
      <Panel label="Datasets" meta={<span>{props.datasets.length}</span>}>
        <ul className="divide-y divide-[var(--certa-border)]">
          {props.datasets.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <FileSpreadsheet className="hidden size-5 shrink-0 text-[var(--certa-muted)] sm:block" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{d.title}</span>
                <span className="block text-[13.5px] text-[var(--certa-muted)]">
                  {d.description} {d.usesPeriod ? <em className="not-italic text-[var(--certa-text)]">Uses the period above.</em> : <span>Current snapshot.</span>}
                </span>
              </span>
              <Button size="sm" variant="secondary" icon={<Download className="size-4" aria-hidden />} loading={props.downloading === d.id} disabled={!!props.downloading && props.downloading !== d.id} onClick={() => props.onDownload(d.id)}>
                CSV
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="mt-4 text-[13px] text-[var(--certa-muted)]">Dates and months are in UTC. Hours are decimal hours. Cells that could run as spreadsheet formulas are prefixed with an apostrophe.</p>
    </div>
  );
}
