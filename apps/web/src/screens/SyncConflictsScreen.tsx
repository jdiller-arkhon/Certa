'use client';

import type { SyncConflictsScreenProps } from '@certa/contract';
import { CloudCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/text';

export function SyncConflictsScreen(props: SyncConflictsScreenProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Sync" title="Needs review" description="Changes made on this device that the server couldn’t accept. Nothing is lost until you choose." />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.conflicts.length ? (
        <Card className="p-6"><SkeletonRows rows={3} /></Card>
      ) : !props.conflicts.length ? (
        <EmptyState empty={props.empty} icon={<CloudCheck className="size-7" aria-hidden />} />
      ) : (
        <div className="space-y-4">
          {props.conflicts.map((c) => (
            <Card key={c.id} className="p-5 sm:p-6">
              <div className="mb-4">
                <div className="text-[15px] font-semibold">{c.entityLabel}</div>
                <div className="text-[13px] text-[var(--certa-muted)]">{c.fieldLabel}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--certa-border)] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">On this device</div>
                  <p className="mt-2 text-[14px] whitespace-pre-wrap">{c.localValue}</p>
                  <p className="mt-2 text-[12px] text-[var(--certa-muted)]">{c.localChangedBy} · {c.localAt.display}</p>
                </div>
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--certa-expired)_35%,var(--certa-border))] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">Server says</div>
                  <p className="mt-2 text-[14px] whitespace-pre-wrap">{c.serverValue}</p>
                  <p className="mt-2 text-[12px] text-[var(--certa-muted)]">{c.serverChangedBy} · {c.serverAt.display}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="danger" onClick={() => props.onResolve({ conflictId: c.id, choose: 'server', note: null })}>Discard my change</Button>
                <Button onClick={() => props.onResolve({ conflictId: c.id, choose: 'local', note: null })}>Try again</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
