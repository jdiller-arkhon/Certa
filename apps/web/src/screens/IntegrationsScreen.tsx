'use client';

import type { IntegrationsScreenProps } from '@certa/contract';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';
import { ListCard, RowButton, RowTitle, Section, When } from './_parts';

const LIFETIMES: { value: string; label: string }[] = [
  { value: '', label: 'Never (rotate manually)' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
];

export function IntegrationsScreen(props: IntegrationsScreenProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Argus');
  const [lifetime, setLifetime] = useState('365');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const revokingKey = props.keys.find((k) => k.id === revoking);
  const example = `curl -H "Authorization: Bearer ${props.createdKey ?? 'ck_…'}" \\\n  "${props.apiBaseUrl}/verify/lookup?certificateNumber=4123456"`;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Integrations"
        description="API keys let Argus and other systems check whether a pilot or aircraft is legal to fly, from your records. Keys are read-only and only see this organization."
        actions={props.canManage && <Button arrow icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Create API key</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      {props.createdKey && (
        <Card className="mb-6 border-[color-mix(in_srgb,var(--certa-current)_40%,var(--certa-border))] p-5">
          <div className="mb-1 text-[15px] font-semibold">Your new API key</div>
          <p className="mb-3 text-[13px] text-[var(--certa-muted)]">Copy it now and store it in Argus’s secret settings. Certa won’t show it again.</p>
          <div className="flex items-center gap-2">
            <input readOnly aria-label="New API key" value={props.createdKey} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--certa-border)] bg-[var(--certa-inset)] px-3 font-mono text-[13px]" />
            <Button
              icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(props.createdKey!);
                  setCopied(true);
                } catch {}
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" onClick={() => (setCopied(false), props.onDismissKey())}>Done</Button>
          </div>
        </Card>
      )}

      {props.loading && !props.keys.length ? (
        <Card className="p-6"><SkeletonRows rows={3} /></Card>
      ) : !props.keys.length ? (
        <EmptyState
          empty={{ title: 'No API keys yet', body: 'Create a key for Argus to verify pilots and aircraft against Certa before a mission is dispatched.', actionLabel: props.canManage ? 'Create API key' : null }}
          icon={<KeyRound className="size-7" aria-hidden />}
          onAction={() => setOpen(true)}
        />
      ) : (
        <ListCard title="API keys" count={props.keys.length}>
          {props.keys.map((k) => (
            <RowButton key={k.id}>
              <RowTitle title={k.name} sub={<><code className="font-mono">{k.prefix}…</code> · {k.scopes.join(', ')} · created <When d={k.created} /></>} />
              <span className="flex items-center gap-5 text-[13px]">
                <span className="flex flex-col sm:items-end">
                  <span>{k.lastUsed ? <>Used <When d={k.lastUsed} /></> : 'Never used'}</span>
                  <span className="text-[var(--certa-muted)]">{k.expires ? <>Expires <When d={k.expires} /></> : 'No expiry'}</span>
                </span>
                {props.canManage && <Button size="sm" variant="ghost" aria-label={`Revoke ${k.name}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setRevoking(k.id)} />}
              </span>
            </RowButton>
          ))}
        </ListCard>
      )}

      <Section title="Verification API" className="mt-6">
        <p className="mb-3 text-[14px] text-[var(--certa-muted)]">
          Look up by Certa id (<code>/verify/pilots/:id</code>, <code>/verify/aircraft/:id</code>), by certificate number, registration, or serial (<code>/verify/lookup</code>), or check a whole flight (<code>POST /verify/flight</code>). Answers are advisory; the remote pilot in command remains responsible.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-[var(--certa-inset)] p-4 text-[12px] leading-relaxed"><code>{example}</code></pre>
      </Section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create API key"
        description="Read-only: it can verify pilots and aircraft, nothing else."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="key-form" arrow loading={props.creating}>Create key</Button>
          </>
        }
      >
        <form
          id="key-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onCreateKey({ name: name.trim(), expiresInDays: lifetime ? Number(lifetime) : null });
            setOpen(false);
          }}
        >
          <Field label="Name" hint="Where it’s used, e.g. “Argus production”">{(a) => <Input {...a} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Expires">
            {(a) => (
              <Select {...a} value={lifetime} onChange={(e) => setLifetime(e.target.value)}>
                {LIFETIMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={!!revokingKey}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revokingKey?.name ?? ''}?`}
        description="Anything using it stops working immediately."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (revoking && props.onRevokeKey(revoking), setRevoking(null))}>Revoke key</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]"><code>{revokingKey?.prefix}…</code></p>
      </Dialog>
    </div>
  );
}
