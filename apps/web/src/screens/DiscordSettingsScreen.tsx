'use client';

import type { DiscordSettingsScreenProps } from '@certa/contract';
import { Check, Copy, Link2, MessageSquare, RefreshCw, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners } from '@/components/ui/feedback';
import { Panel } from '@/components/ui/panel';
import { LEVEL_COLOR } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';

/** "9:41" until the code expires; null once it has. */
function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null;
}

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`flex items-start justify-between gap-6 px-5 py-4 ${disabled ? 'opacity-55' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] text-[var(--certa-muted)]">{description}</span>
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden className="h-6 w-11 rounded-full bg-[var(--certa-border)] transition-colors peer-checked:bg-[var(--certa-action)] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--certa-focus)]" />
        <span aria-hidden className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function DiscordSettingsScreen(props: DiscordSettingsScreenProps) {
  const [copied, setCopied] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const left = useCountdown(props.code?.expiresAt ?? null);
  const command = props.code ? `/certa link code:${props.code.value}` : '';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Discord"
        description="Link your account to the Certa bot in the Arkhon Discord to log flights, check totals and Part 107 currency, and get recurrent training reminders from Discord."
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <div className="space-y-6">
        <Panel
          label="Your link"
          meta={props.linked ? <span style={{ color: LEVEL_COLOR.green }}>Linked</span> : <span>Not linked</span>}
        >
          {!props.canLink ? (
            <p className="px-5 py-6 text-[14px] text-[var(--certa-muted)]">Only pilots can link Discord. Ask an admin to add you as a pilot in this organization.</p>
          ) : props.linked ? (
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-[var(--certa-inset)]"><Link2 className="size-4" aria-hidden /></span>
                <div>
                  <div className="text-[15px] font-semibold">Linked to Discord</div>
                  <div className="text-[13px] text-[var(--certa-muted)]">Since {props.linkedAt?.display}. Unlinking cuts the bot off immediately.</div>
                </div>
              </div>
              <Button variant="secondary" icon={<Unlink className="size-4" aria-hidden />} onClick={() => setConfirmUnlink(true)} disabled={props.busy}>Unlink</Button>
            </div>
          ) : props.code && left ? (
            <div className="px-5 py-5">
              <ol className="mb-4 space-y-1.5 text-[14px]">
                <li><span className="font-semibold">1.</span> Open the Arkhon Discord.</li>
                <li><span className="font-semibold">2.</span> Run this command in any channel:</li>
              </ol>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="tabular flex-1 rounded-xl border border-[var(--certa-border)] bg-[var(--certa-inset)] px-4 py-3 font-mono text-[15px] font-semibold tracking-wide select-all">{command}</code>
                <Button
                  variant="secondary"
                  icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(command).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    });
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="mt-3 text-[13px] text-[var(--certa-muted)]" aria-live="polite">
                Works once. Expires in <span className="tabular font-semibold text-[var(--certa-text)]">{left}</span>. This page updates when you’re linked.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-[var(--certa-inset)]"><MessageSquare className="size-4" aria-hidden /></span>
                <div>
                  <div className="text-[15px] font-semibold">{props.code ? 'That code expired' : 'Get a link code'}</div>
                  <div className="text-[13px] text-[var(--certa-muted)]">A one-time code, valid for 10 minutes, that you paste into the bot.</div>
                </div>
              </div>
              <Button icon={props.code ? <RefreshCw className="size-4" aria-hidden /> : undefined} loading={props.busy} onClick={props.onGenerateCode}>
                {props.code ? 'New code' : 'Get code'}
              </Button>
            </div>
          )}
        </Panel>

        <Panel label="Leaderboard" bodyClassName="divide-y divide-[var(--certa-border)]">
          <Toggle
            label="Show me on the community leaderboard"
            description={
              !props.orgLeaderboardEnabled
                ? 'Your organization has turned the leaderboard off.'
                : 'Everyone in the Arkhon Discord sees your name, flight count and flight time. Off by default.'
            }
            checked={props.leaderboardOptIn}
            disabled={!props.linked || !props.orgLeaderboardEnabled || props.busy}
            onChange={props.onLeaderboardChange}
          />
          {props.canManageOrg && (
            <Toggle
              label="Allow this organization on the leaderboard"
              description="When off, no one in your organization appears, whatever they chose."
              checked={props.orgLeaderboardEnabled}
              disabled={props.busy}
              onChange={props.onOrgLeaderboardChange}
            />
          )}
        </Panel>

        <Panel label="What the bot can see">
          <ul className="space-y-1.5 px-5 py-4 text-[14px]">
            <li>Your name, flight totals, and Part 107 training dates and due date.</li>
            <li>It can log flights for you, matched to an aircraft in your fleet. Those flights say they came from Discord.</li>
            <li className="text-[var(--certa-muted)]">It never receives your certificate number, other pilots’ records, or anything from other organizations.</li>
          </ul>
        </Panel>
      </div>

      <Dialog
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        title="Unlink Discord?"
        description="The bot stops working for you right away. You can link again any time with a new code."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmUnlink(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => (props.onUnlink(), setConfirmUnlink(false))}>Unlink</Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
