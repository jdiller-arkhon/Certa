'use client';

import { CheckCircle2, RadioTower } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/text';

export type LiveLinkStage = 'loading' | 'disabled' | 'not-pilot2' | 'ready' | 'linking' | 'linked';

export interface LiveLinkScreenProps {
  stage: LiveLinkStage;
  controller: string | null;
  aircraft: string | null;
  error: string | null;
  onLink: () => void;
  onDone: () => void;
}

/** /live/link: opened inside DJI Pilot 2 (Cloud Service → Open Platform) to link the controller. */
export function LiveLinkScreen(p: LiveLinkScreenProps) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Live" title="Link this controller" description="Once linked, every flight from this controller streams to Certa and is logged automatically when the drone lands." />
      <Banners>{p.error && <Banner key="e" tone="error">{p.error}</Banner>}</Banners>
      <Card className="p-6">
        {p.stage === 'loading' && <p className="text-[14.5px] text-[var(--certa-muted)]">Checking this device…</p>}
        {p.stage === 'disabled' && <p className="text-[14.5px] text-[var(--certa-muted)]">Live linking isn’t switched on for this Certa server yet. Ask your Certa admin.</p>}
        {p.stage === 'not-pilot2' && (
          <div className="space-y-3 text-[14.5px]">
            <p>Open this page inside <strong>DJI Pilot 2</strong> on the drone’s controller:</p>
            <ol className="list-decimal space-y-1 pl-5 text-[var(--certa-muted)]">
              <li>On the Pilot 2 home screen, tap <strong>Cloud Service</strong>.</li>
              <li>Choose <strong>Open Platform</strong> and enter this page’s address.</li>
              <li>Sign in to Certa, then tap <strong>Link this controller</strong>.</li>
            </ol>
            <p className="text-[13px] text-[var(--certa-muted)]">Flying a drone that doesn’t use Pilot 2? Import its flight log after you land instead.</p>
          </div>
        )}
        {(p.stage === 'ready' || p.stage === 'linking') && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div><dt className="text-[12px] text-[var(--certa-muted)]">Controller</dt><dd className="font-semibold">{p.controller ?? 'Not detected'}</dd></div>
              <div><dt className="text-[12px] text-[var(--certa-muted)]">Drone</dt><dd className="font-semibold">{p.aircraft ?? 'Turn the drone on to include it'}</dd></div>
            </dl>
            <Button className="w-full" size="lg" icon={<RadioTower className="size-4" aria-hidden />} loading={p.stage === 'linking'} disabled={!p.controller} onClick={p.onLink}>
              Link this controller
            </Button>
          </div>
        )}
        {p.stage === 'linked' && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-[var(--certa-current)]" aria-hidden />
            <p className="text-[16px] font-semibold">Linked to Certa</p>
            <p className="text-[14px] text-[var(--certa-muted)]">Fly as usual. Your flights appear on Certa’s Live page while you fly and are logged when you land.</p>
            <Button variant="secondary" onClick={p.onDone}>Back to Pilot 2</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
