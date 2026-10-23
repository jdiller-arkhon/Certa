'use client';

import type { PlatformComplianceScreenProps } from '@certa/contract';
import { CalendarCheck2, Download, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, SkeletonRows } from '@/components/ui/feedback';
import { Panel } from '@/components/ui/panel';
import { Segmented } from '@/components/ui/segmented';
import { LEVEL_COLOR, LevelIcon } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';

export function PlatformComplianceScreen(props: PlatformComplianceScreenProps) {
  const pilotsIn = (rows: PlatformComplianceScreenProps['groups'][number]['rows']) => [...new Set(rows.map((r) => r.pilotKey).filter((k): k is string => !!k))];
  return (
    <div>
      <PageHeader
        eyebrow="Arkhon platform console"
        title="Compliance"
        description="Certificates, recurrent training, registrations, insurance, waivers and maintenance coming due, across every organization."
        actions={<Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={props.onDownload}>Download CSV</Button>}
      />
      <Banners>
        {props.error && <Banner key="e" tone="error" onRetry={props.onRetry}>{props.error}</Banner>}
        {props.notice && <Banner key="n" tone={props.notice.tone} onDismiss={props.onDismissNotice}>{props.notice.text}</Banner>}
      </Banners>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented<string> label="Look ahead" value={String(props.windowDays)} options={props.windowOptions.map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => props.onWindow(Number(v))} />
        {props.state === 'ready' && (
          <p className="tabular text-[14px] text-[var(--certa-muted)]">
            {props.counts.total} item{props.counts.total === 1 ? '' : 's'} · {props.counts.overdue} overdue · {props.counts.pilots} pilot{props.counts.pilots === 1 ? '' : 's'} to remind
          </p>
        )}
      </div>
      {props.state === 'loading' ? (
        <Card className="p-6"><SkeletonRows rows={6} /></Card>
      ) : props.state === 'ready' && !props.groups.length ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <CalendarCheck2 className="size-8 text-[var(--certa-current)]" aria-hidden />
          <p className="text-[16px] font-semibold">Nothing due in this window</p>
          <p className="text-[14px] text-[var(--certa-muted)]">Every organization’s records are current. Look further ahead to plan renewals.</p>
        </Card>
      ) : props.state === 'ready' ? (
        <div className="space-y-6">
          {props.groups.map((g) => {
            const keys = pilotsIn(g.rows);
            return (
              <Panel
                key={g.id}
                label={
                  <span className="inline-flex items-center gap-2" style={{ color: LEVEL_COLOR[g.level] }}>
                    <LevelIcon level={g.level} className="size-3.5" />
                    {g.label} · {g.rows.length}
                  </span>
                }
                meta={
                  keys.length > 0 && (
                    <Button size="sm" variant="ghost" icon={<Mail className="size-4" aria-hidden />} disabled={props.busy} onClick={() => props.onRemind(keys)}>
                      Remind {keys.length} pilot{keys.length === 1 ? '' : 's'}
                    </Button>
                  )
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] table-fixed text-[14px]">
                    <thead>
                      <tr className="text-left text-[12px] text-[var(--certa-muted)]">
                        <th className="w-[38%] px-5 py-2.5 font-medium">Item</th>
                        <th className="w-[20%] px-3 py-2.5 font-medium">For</th>
                        <th className="hidden w-[20%] px-3 py-2.5 font-medium md:table-cell">Organization</th>
                        <th className="px-5 py-2.5 font-medium">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--certa-border)]">
                      {g.rows.map((r) => (
                        <tr key={r.key} className={r.href ? 'cursor-pointer transition-colors hover:bg-[var(--certa-inset)]' : undefined} onClick={r.href ? () => props.onOpen(r.href!) : undefined}>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-2">
                              <span style={{ color: LEVEL_COLOR[r.level] }}><LevelIcon level={r.level} /></span>
                              <span className="font-medium">{r.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {r.href ? (
                              <a href={r.href} onClick={(e) => { e.preventDefault(); props.onOpen(r.href!); }} className="font-medium hover:underline">{r.subject}</a>
                            ) : (
                              r.subject
                            )}
                            <span className="block text-[12px] text-[var(--certa-muted)]">{r.subjectType}</span>
                          </td>
                          <td className="hidden px-3 py-3 text-[var(--certa-muted)] md:table-cell">{r.orgName}</td>
                          <td className="tabular px-5 py-3 whitespace-nowrap" style={{ color: r.level === 'green' ? undefined : LEVEL_COLOR[r.level] }}>{r.due}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
