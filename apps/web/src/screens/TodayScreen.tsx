'use client';

import type { ReadinessDashboardScreenProps, ReadinessLevel, ReadinessRowViewModel } from '@certa/contract';
import { ChevronRight, Plane, Plus, Route, Users } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ReadinessRing } from '@/components/gauge';
import { CountUp, Rise, Stagger, StaggerItem, StaggerLi } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TriangleHero } from '@/components/triangle-hero';
import { Banner, Banners, Skeleton, SkeletonRows } from '@/components/ui/feedback';
import { LEVEL_COLOR, LevelDot, LevelIcon, StatusBadge } from '@/components/ui/status';
import { Eyebrow, Label } from '@/components/ui/text';

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

  return (
    <div className="space-y-8">
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Rise>
            <Eyebrow live={props.overall.level === 'red'}>Today · {props.asOf.absolute}</Eyebrow>
          </Rise>
          <Rise delay={0.06}>
            <h1 className="headline flex items-start gap-3 text-[28px] leading-[1.12] sm:text-[36px]">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}
                className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9"
                style={{ background: LEVEL_COLOR[props.overall.level], color: 'var(--certa-canvas)' }}
              >
                <LevelIcon level={props.overall.level} className="size-5" />
              </motion.span>
              {props.overall.label}
            </h1>
          </Rise>
        </div>
        <Rise delay={0.12} className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={props.onAddAircraft} icon={<Plus className="size-4" aria-hidden />}>
            Aircraft
          </Button>
          <Button arrow onClick={props.onLogFlight} icon={<Route className="size-4" aria-hidden />}>
            Log flight
          </Button>
        </Rise>
      </div>

      <Rise delay={0.1}>
        <Card className="relative overflow-hidden">
          <div className="dot-grid dot-grid-fade pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <div className="relative grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[auto_1fr]">
            <div className="mx-auto">
              <ReadinessRing counts={props.counts} size={210} />
            </div>
            <div className="min-w-0 space-y-6">
              <Stagger gap={0.08} delay={0.3} className="grid grid-cols-3 gap-2 sm:gap-3">
                {LEVELS.map((l) => (
                  <StaggerItem key={l.level} className="h-full">
                    <div className="flex h-full min-w-0 flex-col justify-between gap-1 rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] p-3 sm:p-4">
                      <div className="flex items-start gap-1.5 text-[11px] leading-tight font-semibold sm:text-[12px]" style={{ color: LEVEL_COLOR[l.level] }}>
                        <LevelIcon level={l.level} className="size-3" /> <span>{l.label}</span>
                      </div>
                      <CountUp value={props.counts[l.level]} className="headline tabular mt-1 block text-[28px] leading-none sm:text-[34px]" />
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
              {props.upcoming.length > 0 && (
                <div>
                  <Label>Coming up · next 90 days</Label>
                  <Stagger gap={0.05} delay={0.5} className="mt-3 space-y-0.5" inView>
                    {props.upcoming.slice(0, 5).map((u, i) => (
                      <StaggerItem key={i}>
                        <button
                          type="button"
                          onClick={() => props.onOpen(u.href)}
                          className="group flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--certa-inset)] sm:items-center"
                        >
                          <span className="flex h-5 items-center">
                            <LevelDot level={u.level} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                            <span className="min-w-0 flex-1 sm:truncate">
                              <span className="font-semibold">{u.subject}</span> <span className="text-[var(--certa-muted)]">· {u.label}</span>
                            </span>
                            <span className="tabular shrink-0 text-[13px] text-[var(--certa-muted)]">{u.due.display}</span>
                          </span>
                        </button>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              )}
            </div>
          </div>
        </Card>
      </Rise>

      <div className="grid gap-6 xl:grid-cols-2">
        <Rise delay={0.18}>
          <RowList title="Pilots" icon={<Users className="size-4" aria-hidden />} rows={props.pilots} onOpen={props.onOpen} />
        </Rise>
        <Rise delay={0.24}>
          <RowList title="Aircraft" icon={<Plane className="size-4" aria-hidden />} rows={props.aircraft} onOpen={props.onOpen} />
        </Rise>
      </div>
    </div>
  );
}
