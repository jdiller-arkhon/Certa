'use client';

import type { ReadinessDashboardScreenProps, ReadinessLevel, ReadinessRowViewModel } from '@certa/contract';
import { ChevronRight, Plane, Plus, Route, Users } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ReadinessRing } from '@/components/gauge';
import { HangarHero } from '@/components/hangar';
import { CountUp, Rise, Stagger, StaggerItem, StaggerLi } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TriangleHero } from '@/components/triangle-hero';
import { Banner, Banners, Skeleton, SkeletonRows } from '@/components/ui/feedback';
import { LEVEL_COLOR, LevelDot, LevelIcon, StatusBadge } from '@/components/ui/status';
import { Eyebrow, Label } from '@/components/ui/text';
import { Panel, PanelRow, StatStrip } from '@/components/ui/panel';
import { ActionQueue } from './_actions';

const LEVELS: { level: ReadinessLevel; label: string }[] = [
  { level: 'green', label: 'Current' },
  { level: 'amber', label: 'Attention' },
  { level: 'red', label: 'Not current' },
];

function RowList({ title, icon, rows, onOpen }: { title: string; icon: ReactNode; rows: ReadinessRowViewModel[]; onOpen: (href: string) => void }) {
  const issues = rows.filter((r) => r.status.level !== 'green').length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--certa-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--certa-muted)]">{icon}</span>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <span className="tabular text-sm text-[var(--certa-muted)]">{rows.length}</span>
        </div>
        {issues > 0 ? <Label className="!tracking-[0.08em]">{issues} need attention</Label> : <Label className="!tracking-[0.08em]">All current</Label>}
      </div>
      <Stagger gap={0.035} delay={0.15} inView>
        <ul role="list">
          {rows.map((r) => (
            <StaggerLi key={r.id} className="border-b border-[var(--certa-border)] last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(r.href)}
                className="group flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors duration-200 hover:bg-[var(--certa-inset)] focus-visible:bg-[var(--certa-inset)] focus-visible:outline-none"
              >
                <span className="flex h-[22px] items-center">
                  <LevelDot level={r.status.level} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-[15px] font-semibold">{r.name}</span>
                    {r.subtitle && <span className="tabular truncate text-[13px] text-[var(--certa-muted)]">{r.subtitle}</span>}
                  </span>
                  {r.reasons.length > 0 && (
                    <span className="mt-1.5 block space-y-1">
                      {r.reasons.slice(0, 3).map((x, i) => (
                        <span key={i} className="flex items-start gap-1.5 text-[13px]" style={{ color: LEVEL_COLOR[x.level] }}>
                          <LevelIcon level={x.level} className="mt-0.5 size-3" />
                          <span>
                            <span className="text-[var(--certa-text)]">{x.text}</span>
                            {x.due && <span className="text-[var(--certa-muted)]"> · {x.due.display}</span>}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={r.status} size="sm" />
                  <ChevronRight aria-hidden className="size-4 text-[var(--certa-muted)] transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </button>
            </StaggerLi>
          ))}
        </ul>
      </Stagger>
    </Card>
  );
}

function LoadingToday() {
  return (
    <div role="status" aria-label="Loading" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
      <Card className="flex flex-col items-center gap-8 p-8 md:flex-row">
        <Skeleton className="size-[200px] rounded-full" />
        <div className="w-full flex-1 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5"><SkeletonRows rows={4} /></Card>
        <Card className="p-5"><SkeletonRows rows={4} /></Card>
      </div>
    </div>
  );
}

export function TodayScreen(props: ReadinessDashboardScreenProps) {
  const isEmpty = props.pilots.length === 0 && props.aircraft.length === 0;
  if (props.loading && isEmpty) return <LoadingToday />;

  if (isEmpty) {
    return (
      <div data-testid="today-empty">
        <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div className="space-y-6">
            <Rise>
              <Eyebrow live>Today · {props.asOf.absolute}</Eyebrow>
            </Rise>
            <Rise delay={0.06}>
              <h1 className="headline text-[40px] leading-[1.06] sm:text-[48px]">{props.empty.title}</h1>
            </Rise>
            <Rise delay={0.12}>
              <p className="max-w-lg text-[17px] leading-relaxed text-[var(--certa-muted)]">{props.empty.body}</p>
            </Rise>
            <Rise delay={0.18} className="flex flex-wrap gap-3">
              <Button size="lg" arrow onClick={props.onAddAircraft} icon={<Plane className="size-4" aria-hidden />}>
                {props.empty.actionLabel ?? 'Add aircraft'}
              </Button>
              <Button size="lg" variant="secondary" onClick={props.onAddPilot} icon={<Users className="size-4" aria-hidden />}>
                Add pilot
              </Button>
            </Rise>
            <Rise delay={0.24}>
              <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                {['Add your certificate', 'Add an aircraft', 'Log a flight'].map((t, i) => (
                  <li key={t} className="rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] p-4">
                    <span className="tabular text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)]">STEP {i + 1}</span>
                    <span className="mt-1 block text-sm font-semibold">{t}</span>
                  </li>
                ))}
              </ol>
            </Rise>
          </div>
          <div className="hidden md:block">
            <TriangleHero className="mx-auto w-full max-w-[440px]" />
          </div>
        </div>
      </div>
    );
  }

  const needs = props.actions.filter((a) => a.level === 'red').length;
  const soon = props.actions.filter((a) => a.level === 'amber').length;
  const headline = needs ? `${needs} ${needs === 1 ? 'thing needs' : 'things need'} you today.` : soon ? 'Legal to fly today.' : 'Everything is current.';
  const subline = soon ? `${soon} more ${soon === 1 ? 'is' : 'are'} coming due.` : needs ? 'Nothing else is due soon.' : 'Nothing due in the next 90 days.';

  return (
    <div className="space-y-8">
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="space-y-6 lg:pt-4">
          <Rise>
            <Eyebrow live={props.overall.level === 'red'}>Today · {props.asOf.absolute}</Eyebrow>
          </Rise>
          <Rise delay={0.05}>
            <h1 className="headline text-[40px] leading-[1.04] sm:text-[56px]">
              <span className="block">{headline}</span>
              <span className="block text-[var(--certa-muted)]">{subline}</span>
            </h1>
          </Rise>
          <Rise delay={0.1}>
            <p className="max-w-xl text-[17px] leading-relaxed text-[var(--certa-muted)]">
              {props.overall.label}. Fix anything below without leaving this page; every change is recorded in the audit log.
            </p>
          </Rise>
          <Rise delay={0.15} className="flex flex-wrap gap-3">
            <Button size="lg" arrow onClick={props.onLogFlight}>Log a flight</Button>
            <Button size="lg" variant="secondary" onClick={() => document.getElementById('action-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Review {props.actions.length || 'all'} {props.actions.length === 1 ? 'item' : 'items'}
            </Button>
          </Rise>
        </div>

        <Rise delay={0.12}>
          <Panel label="Pilots and aircraft" meta={<span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[props.overall.level] }} />Live</span>}>
            <StatStrip
              items={[
                { label: 'Not current', value: <CountUp value={props.counts.red} />, color: props.counts.red ? LEVEL_COLOR.red : undefined },
                { label: 'Due soon', value: <CountUp value={props.counts.amber} />, color: props.counts.amber ? LEVEL_COLOR.amber : undefined },
                { label: 'Current', value: <CountUp value={props.counts.green} /> },
                { label: 'Flights · 7 days', value: <CountUp value={props.activity.last7} /> },
              ]}
            />
            <div className="py-1.5">
              <PanelRow label="Pilots" value={`${props.pilots.filter((p) => p.status.level !== 'red').length} of ${props.pilots.length} legal to fly`} dot={LEVEL_COLOR[worst(props.pilots)]} onClick={() => props.onOpen('/pilots')} />
              <PanelRow label="Aircraft" value={`${props.aircraft.filter((p) => p.status.level !== 'red').length} of ${props.aircraft.length} airworthy`} dot={LEVEL_COLOR[worst(props.aircraft)]} onClick={() => props.onOpen('/aircraft')} />
              <PanelRow label="Flights · 30 days" value={props.activity.last30} />
              {props.activity.lastFlight && <PanelRow label={`Last flight · ${props.activity.lastFlight.label}`} value={props.activity.lastFlight.when.relative} onClick={() => props.onOpen(props.activity.lastFlight!.href)} />}
            </div>
          </Panel>
        </Rise>
      </div>

      <Rise delay={0.16}>
        <ActionQueue items={props.actions} fixing={props.fixing} canFix={props.canFix} onFix={props.onFix} onOpen={props.onOpen} />
      </Rise>

      {props.aircraft.length > 0 && (
        <Rise delay={0.2}>
          <HangarHero aircraft={props.aircraft} onOpen={props.onOpen} />
        </Rise>
      )}

      <Panel label="Coming up" meta="Next 90 days">
        {props.upcoming.length ? (
          <ul className="grid py-1.5 md:grid-cols-2 md:divide-x md:divide-[var(--certa-border)]">
            {[props.upcoming.slice(0, 6), props.upcoming.slice(6, 12)].map((col, c) => (
              <li key={c}>
                <ul>
                  {col.map((u, i) => (
                    <li key={i}>
                      <PanelRow label={<><span className="font-semibold">{u.subject}</span> <span className="text-[var(--certa-muted)]">{u.label}</span></>} value={u.due.absolute} dot={LEVEL_COLOR[u.level]} onClick={() => props.onOpen(u.href)} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-[14px] text-[var(--certa-muted)]">Nothing expires in the next 90 days.</p>
        )}
      </Panel>
    </div>
  );
}

const RANK: Record<ReadinessLevel, number> = { green: 0, amber: 1, red: 2 };
function worst(rows: ReadinessRowViewModel[]): ReadinessLevel {
  return rows.reduce<ReadinessLevel>((w, r) => (RANK[r.status.level] > RANK[w] ? r.status.level : w), 'green');
}
