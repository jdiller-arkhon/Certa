'use client';

import type { AnnouncementDraft, PlatformAnnouncementsScreenProps } from '@certa/contract';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Switch } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { Segmented } from '@/components/ui/segmented';
import { PageHeader } from '@/components/ui/text';

const EMPTY: AnnouncementDraft = { title: '', body: '', audience: 'everyone', important: false, endsOn: '', email: false, push: false };

export function PlatformAnnouncementsScreen(props: PlatformAnnouncementsScreenProps) {
  return (
    <div>
      <PageHeader
        eyebrow="Arkhon platform console"
        title="Announcements"
        description="A banner at the top of Certa for everyone you pick, until it ends. Optionally email it and send a push notification too."
      />
      <Banners>{props.error && <Banner key="e" tone="error" onRetry={props.onRetry}>{props.error}</Banner>}</Banners>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Composer key={props.formKey} {...props} />
        <Panel label="Posted" meta={<span className="tabular">{props.announcements.length}</span>}>
          {props.state === 'loading' ? (
            <div className="p-5"><SkeletonRows rows={3} /></div>
          ) : props.announcements.length ? (
            <ul className="divide-y divide-[var(--certa-border)]">
              {props.announcements.map((a) => (
                <li key={a.id} className="space-y-2 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                        {a.title}
                        <span
                          className="rounded-full border px-2 py-0.5 text-[11.5px] font-semibold"
                          style={a.live ? { color: 'var(--certa-current)', borderColor: 'color-mix(in srgb, var(--certa-current) 40%, transparent)' } : { color: 'var(--certa-muted)', borderColor: 'var(--certa-border)' }}
                        >
                          {a.live ? 'Live' : 'Ended'}
                        </span>
                        {a.important && <span className="rounded-full border border-[color-mix(in_srgb,var(--certa-warning)_40%,transparent)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--certa-warning)]">Important</span>}
                      </p>
                      <p className="text-[12.5px] text-[var(--certa-muted)]">
                        To {a.audience.toLowerCase()} · {a.posted}
                        {a.ends ? ` · ${a.ends}` : ''}
                        {a.reach ? ` · ${a.reach}` : ''}
                      </p>
                    </div>
                    {a.live && <Button size="sm" variant="danger" onClick={() => props.onEnd(a.id)}>End</Button>}
                  </div>
                  <p className="text-[14px] whitespace-pre-line text-[var(--certa-muted)]">{a.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Megaphone className="size-7 text-[var(--certa-muted)]" aria-hidden />
              <p className="text-[14px] text-[var(--certa-muted)]">No announcements yet.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Composer(props: PlatformAnnouncementsScreenProps) {
  const [d, setD] = useState<AnnouncementDraft>(EMPTY);
  const set = <K extends keyof AnnouncementDraft>(k: K, v: AnnouncementDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const audience = props.audienceOptions.find((o) => o.value === d.audience);
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (d.title.trim() && d.body.trim()) props.onPost(d);
        }}
      >
        <h2 className="headline text-[20px]">New announcement</h2>
        <Field label="Title">{(a) => <Input {...a} value={d.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Recurrent training reminder" required />}</Field>
        <Field label="Message" hint={`${d.body.length} / 4000`}>
          {(a) => (
            <textarea
              {...a}
              value={d.body}
              maxLength={4000}
              rows={5}
              required
              onChange={(e) => set('body', e.target.value)}
              className="w-full rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--certa-text)]"
            />
          )}
        </Field>
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium">Who sees it</span>
          <Segmented label="Audience" value={d.audience} options={props.audienceOptions.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set('audience', v)} />
          {audience && <p className="text-[13px] text-[var(--certa-muted)]">{audience.description}</p>}
        </div>
        <Field label="Show until" hint="Last day it shows. Leave empty to keep it up until you end it.">
          {(a) => <Input {...a} type="date" value={d.endsOn} onChange={(e) => set('endsOn', e.target.value)} className="sm:w-56" />}
        </Field>
        <div className="space-y-3 rounded-2xl border border-[var(--certa-border)] p-4">
          <Row label="Mark as important" hint="Shown in amber, and the email subject starts with “Important”.">
            <Switch label="Mark as important" checked={d.important} onChange={(v) => set('important', v)} />
          </Row>
          <Row label="Also email it" hint="One email to each person in the audience.">
            <Switch label="Also email it" checked={d.email} onChange={(v) => set('email', v)} />
          </Row>
          <Row label="Also send a push notification" hint={props.pushAvailable ? 'To devices that turned notifications on.' : 'Push notifications aren’t set up on this server.'}>
            <Switch label="Also send a push notification" checked={d.push} disabled={!props.pushAvailable} onChange={(v) => set('push', v)} />
          </Row>
        </div>
        {props.postError && <p role="alert" className="text-[14px] text-[var(--certa-expired)]">{props.postError}</p>}
        <Button type="submit" arrow loading={props.posting} disabled={!d.title.trim() || !d.body.trim()}>
          Post announcement
        </Button>
      </form>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium">{label}</p>
        <p className="text-[12.5px] text-[var(--certa-muted)]">{hint}</p>
      </div>
      {children}
    </div>
  );
}
