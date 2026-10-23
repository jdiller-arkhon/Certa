'use client';

import type { PlatformActivityScreenProps } from '@certa/contract';
import { Download, History, Mail, Megaphone, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Banner, Banners, SkeletonRows } from '@/components/ui/feedback';
import { Panel } from '@/components/ui/panel';
import { PageHeader } from '@/components/ui/text';

const ICON = { remind: Mail, invite: Send, export: Download, announce: Megaphone };

export function PlatformActivityScreen(props: PlatformActivityScreenProps) {
  return (
    <div>
      <PageHeader eyebrow="Arkhon platform console" title="Admin activity" description="Everything platform admins did in the console: reminders, sign-in help, exports and announcements. This log can’t be edited." />
      <Banners>{props.error && <Banner key="e" tone="error" onRetry={props.onRetry}>{props.error}</Banner>}</Banners>
      {props.state === 'loading' ? (
        <Card className="p-6"><SkeletonRows rows={6} /></Card>
      ) : props.state === 'ready' && !props.events.length ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <History className="size-7 text-[var(--certa-muted)]" aria-hidden />
          <p className="text-[14px] text-[var(--certa-muted)]">No admin actions yet.</p>
        </Card>
      ) : props.state === 'ready' ? (
        <Panel label="Latest 200" meta={<span className="tabular">{props.events.length}</span>}>
          <ol className="divide-y divide-[var(--certa-border)]">
            {props.events.map((e) => {
              const Icon = ICON[e.icon];
              return (
                <li key={e.key} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--certa-inset)]">
                    <Icon className="size-4 text-[var(--certa-muted)]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px]">
                      <span className="font-semibold">{e.actor}</span> {e.action.charAt(0).toLowerCase() + e.action.slice(1)}
                      {e.subject && <> · <span className="font-medium">{e.subject}</span></>}
                      {e.orgName && <span className="text-[var(--certa-muted)]"> ({e.orgName})</span>}
                    </span>
                    {e.detail && <span className="block text-[13px] text-[var(--certa-muted)]">{e.detail}</span>}
                    <span className="block text-[12.5px] text-[var(--certa-muted)]">{e.when}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      ) : null}
    </div>
  );
}
