'use client';

import type { PlatformPilotDetailScreenProps } from '@certa/contract';
import { ArrowLeft, Download, ExternalLink, Mail, Send, SquareArrowOutUpRight } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Banner, Banners, SkeletonRows } from '@/components/ui/feedback';
import { Panel, PanelRow } from '@/components/ui/panel';
import { LEVEL_COLOR, LevelIcon, StatusBadge } from '@/components/ui/status';
import { FlagChip, HoursChart, Tag } from './_platform';

export function PlatformPilotDetailScreen(props: PlatformPilotDetailScreenProps) {
  const [note, setNote] = useState('');
  const p = props.pilot;
  return (
    <div className="space-y-6">
      <button type="button" onClick={props.onBack} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--certa-muted)] hover:text-[var(--certa-text)]">
        <ArrowLeft className="size-4" aria-hidden /> All pilots
      </button>
      <Banners>
        {props.error && <Banner key="e" tone="error" onRetry={props.onRetry}>{props.error}</Banner>}
        {props.notice && <Banner key="n" tone={props.notice.tone} onDismiss={props.onDismissNotice}>{props.notice.text}</Banner>}
      </Banners>
      {props.state === 'loading' || !p ? (
        props.state === 'loading' && <SkeletonRows rows={6} />
      ) : (
        <>
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Avatar user={{ initials: p.initials, name: p.name }} size={56} />
              <div className="min-w-0 space-y-2">
                <h1 className="headline text-[30px] leading-tight sm:text-[36px]">{p.name}</h1>
                <p className="text-[15px] text-[var(--certa-muted)]">
                  {p.orgName}
                  {p.roleLabel ? ` · ${p.roleLabel}` : ''}
                  {p.email ? ` · ${p.email}` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={p.status} size="sm" />
                  {/* The status badge already says “Not cleared”. */}
                  {p.helpFlags.filter((f) => f.id !== 'not_cleared').map((f) => <FlagChip key={f.id} flag={f} size="sm" />)}
                </div>
              </div>
            </div>
          </header>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-border)] lg:grid-cols-4">
            {props.stats.map((s) => (
              <div key={s.label} className="bg-[var(--certa-surface)] px-5 py-4">
                <dt className="text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{s.label}</dt>
                <dd className="headline tabular mt-2 text-[24px] leading-tight">{s.value}</dd>
                {s.hint && <dd className="mt-1 text-[13px] text-[var(--certa-muted)]">{s.hint}</dd>}
              </div>
            ))}
          </dl>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Panel label="Needs attention" meta={<span className="tabular">{props.items.length}</span>}>
                {props.items.length ? (
                  <ul className="divide-y divide-[var(--certa-border)]">
                    {props.items.map((i) => (
                      <li key={i.key} className="flex items-start gap-3 px-5 py-3">
                        <span className="mt-0.5" style={{ color: LEVEL_COLOR[i.level] }}><LevelIcon level={i.level} className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium">{i.label}</span>
                          <span className="block text-[13px] text-[var(--certa-muted)]">{i.due ?? i.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-5 text-[14px] text-[var(--certa-muted)]">Nothing due in the next year. Their records are in order.</p>
                )}
              </Panel>

              <Panel label="Flight hours by month" meta={<span>Last 12 months</span>} bodyClassName="px-3 pt-4 pb-2 sm:px-5">
                <HoursChart months={props.months} caption={`${p.name}: flight hours by month, last 12 months`} />
              </Panel>

              <Panel label="Recent flights" meta={<span className="tabular">{props.recentFlights.length}</span>}>
                {props.recentFlights.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px]">
                      <thead>
                        <tr className="text-left text-[12px] text-[var(--certa-muted)]">
                          <th className="px-5 py-2.5 font-medium">When</th>
                          <th className="px-3 py-2.5 font-medium">Aircraft</th>
                          <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Location</th>
                          <th className="px-5 py-2.5 text-right font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--certa-border)]">
                        {props.recentFlights.map((f) => (
                          <tr key={f.key}>
                            <td className="px-5 py-2.5 whitespace-nowrap">
                              {f.when} {f.source === 'Argus' && <Tag>Argus</Tag>}
                            </td>
                            <td className="px-3 py-2.5">{f.aircraft}</td>
                            <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-[var(--certa-muted)] sm:table-cell">{f.location}</td>
                            <td className="tabular px-5 py-2.5 text-right">{f.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-5 text-[14px] text-[var(--certa-muted)]">No flights in the last 12 months.</p>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel label="Help this pilot" bodyClassName="space-y-5 px-5 py-5">
                <div className="space-y-2">
                  <label htmlFor="remind-note" className="text-[14px] font-semibold">Email a reminder</label>
                  <p className="text-[13px] text-[var(--certa-muted)]">Sends {p.email ?? 'them'} the list under “Needs attention”, with links to fix each item. Add a note if you like.</p>
                  <textarea
                    id="remind-note"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Optional note, e.g. “Please renew before Friday’s inspection job.”"
                    className="w-full rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2.5 text-[14px] outline-none focus:border-[var(--certa-text)]"
                  />
                  <Button size="sm" icon={<Mail className="size-4" aria-hidden />} loading={props.busy === 'remind'} disabled={!p.email || !!props.busy} onClick={() => props.onRemind(note)}>
                    Send reminder
                  </Button>
                </div>
                <div className="space-y-2 border-t border-[var(--certa-border)] pt-5">
                  <p className="text-[14px] font-semibold">Sign-in help</p>
                  <p className="text-[13px] text-[var(--certa-muted)]">{props.tools.inviteHint}</p>
                  <div className="flex flex-wrap gap-2">
                    {props.tools.canInvite && (
                      <Button size="sm" variant="secondary" icon={<Send className="size-4" aria-hidden />} loading={props.busy === 'invite'} disabled={!!props.busy} onClick={props.onInvite}>
                        Re-send sign-in instructions
                      </Button>
                    )}
                    {props.tools.arkhonAdminUrl && (
                      <a href={props.tools.arkhonAdminUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--certa-border)] px-4 text-sm font-semibold hover:bg-[var(--certa-inset)]">
                        <ExternalLink className="size-4" aria-hidden /> Arkhon account
                      </a>
                    )}
                  </div>
                  {props.tools.arkhonAdminUrl && <p className="text-[12.5px] text-[var(--certa-muted)]">Passwords, two-factor and suspensions are managed on the Arkhon account.</p>}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[var(--certa-border)] pt-5">
                  <Button size="sm" variant="secondary" icon={<Download className="size-4" aria-hidden />} loading={props.busy === 'logbook'} onClick={props.onDownloadLogbook}>
                    Logbook CSV
                  </Button>
                  {props.tools.openInOrgHref && (
                    <Button size="sm" variant="ghost" icon={<SquareArrowOutUpRight className="size-4" aria-hidden />} onClick={props.onOpenInOrg}>
                      Open in {p.orgName}
                    </Button>
                  )}
                </div>
              </Panel>

              <Panel label="Account">
                <PanelRow label="Certa" value={p.account.label} dot={p.account.level ? LEVEL_COLOR[p.account.level] : undefined} />
                <PanelRow label="Last sign-in" value={props.lastSignIn ?? 'Never'} />
                <PanelRow label="Arkhon account" value={p.arkhonLinked ? 'Linked' : 'Not linked'} />
                <PanelRow label="Discord" value={p.discordLinked ? 'Linked' : 'Not linked'} />
                {props.otherOrganizations.map((o) => <PanelRow key={o.id} label={`Also in ${o.name}`} value={o.roleLabel} />)}
              </Panel>

              <Panel label="Admin history">
                {props.history.length ? (
                  <ul className="divide-y divide-[var(--certa-border)]">
                    {props.history.map((h) => (
                      <li key={h.key} className="px-5 py-3">
                        <p className="text-[14px]">{h.text}</p>
                        <p className="text-[12.5px] text-[var(--certa-muted)]">{h.when}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-5 text-[14px] text-[var(--certa-muted)]">No admin actions yet.</p>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
