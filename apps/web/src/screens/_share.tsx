'use client';

import type { SharePacketViewModel } from '@certa/contract';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status';

const LIFETIMES = [1, 3, 7, 14, 30];

export function ShareButton({ share, onOpen }: { share: SharePacketViewModel; onOpen: () => void }) {
  if (!share.canShare) return null;
  return (
    <Button variant="secondary" icon={<Share2 className="size-4" aria-hidden />} onClick={onOpen}>
      Share with inspector
    </Button>
  );
}

/** Create a time-boxed, read-only inspector packet link; list and revoke existing ones. */
export function ShareDialog({
  open,
  onClose,
  subject,
  share,
  onCreate,
  onRevoke,
}: {
  open: boolean;
  onClose: () => void;
  subject: string;
  share: SharePacketViewModel;
  onCreate: (input: { expiresInDays: number }) => void;
  onRevoke: (linkId: string) => void;
}) {
  const [daysValid, setDaysValid] = useState(7);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [share.createdUrl]);
  const copy = async () => {
    if (!share.createdUrl) return;
    try {
      await navigator.clipboard.writeText(share.createdUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const active = share.links.filter((l) => l.active);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share with an inspector"
      description={`A read-only page and sealed PDF of ${subject}’s compliance records. No account needed. The link stops working when it expires or you revoke it.`}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-5">
        {share.createdUrl ? (
          <div className="rounded-xl border border-[var(--certa-border)] bg-[var(--certa-inset)] p-4">
            <div className="mb-2 text-[13px] font-semibold">Link created — copy it now. It won’t be shown again.</div>
            <div className="flex items-center gap-2">
              <input readOnly aria-label="Share link" value={share.createdUrl} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 font-mono text-[12px]" />
              <Button size="sm" icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate({ expiresInDays: daysValid });
            }}
          >
            <Field label="Link works for" className="flex-1">
              {(a) => (
                <Select {...a} value={daysValid} onChange={(e) => setDaysValid(Number(e.target.value))}>
                  {LIFETIMES.map((d) => <option key={d} value={d}>{d === 1 ? '1 day' : `${d} days`}</option>)}
                </Select>
              )}
            </Field>
            <Button type="submit" size="lg" icon={<Link2 className="size-4" aria-hidden />} loading={share.creating}>Create link</Button>
          </form>
        )}

        {share.links.length > 0 && (
          <div>
            <div className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">
              Links · {active.length} active
            </div>
            <ul className="divide-y divide-[var(--certa-border)] rounded-xl border border-[var(--certa-border)]">
              {share.links.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.label}</span>
                    <span className="text-[12px] text-[var(--certa-muted)]">
                      {l.active ? `Expires ${l.expires.relative}` : l.status.label} · {l.viewCount} view{l.viewCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  {l.active ? (
                    <Button size="sm" variant="danger" onClick={() => onRevoke(l.id)}>Revoke</Button>
                  ) : (
                    <StatusBadge status={l.status} size="sm" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
