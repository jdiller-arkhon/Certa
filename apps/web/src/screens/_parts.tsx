'use client';

import type { DateDisplay, FlightRowViewModel, ReadinessReason } from '@certa/contract';
import { ChevronRight, CloudOff, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/cn';
import { Stagger, StaggerLi } from '@/components/motion';
import { Card } from '@/components/ui/card';
import { LEVEL_COLOR, LevelIcon } from '@/components/ui/status';
import { Label } from '@/components/ui/text';

/** Shared building blocks for the Phase 2 screens (lists, detail panels, stats). */

export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--certa-muted)]" />
      <input
        type="search"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] pr-4 pl-10 text-[15px] transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--certa-muted)] focus:border-[var(--certa-text)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--certa-text)_8%,transparent)] focus:outline-none"
      />
    </label>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

/** A card holding a list of clickable rows. */
export function ListCard({ title, count, aside, children, className }: { title?: ReactNode; count?: number; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--certa-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {count !== undefined && <span className="tabular text-sm text-[var(--certa-muted)]">{count}</span>}
          </div>
          {aside}
        </div>
      )}
      <Stagger gap={0.03} delay={0.05}>
        <ul role="list">{children}</ul>
      </Stagger>
    </Card>
  );
}

export function RowButton({ onClick, children, label }: { onClick?: () => void; children: ReactNode; label?: string }) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">{children}</span>
      {onClick && <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--certa-muted)] transition-transform duration-300 group-hover:translate-x-0.5" />}
    </>
  );
  return (
    <StaggerLi className="border-b border-[var(--certa-border)] last:border-b-0">
      {onClick ? (
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-[var(--certa-inset)] focus-visible:bg-[var(--certa-inset)] focus-visible:outline-none"
        >
          {inner}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-5 py-4">{inner}</div>
      )}
    </StaggerLi>
  );
}

/** Primary text + muted secondary line, used as the first column of a row. */
export function RowTitle({ title, sub, badge }: { title: ReactNode; sub?: ReactNode; badge?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="truncate text-[15px] font-semibold">{title}</span>
        {badge}
      </span>
      {sub && <span className="mt-0.5 block truncate text-[13px] text-[var(--certa-muted)]">{sub}</span>}
    </span>
  );
}

/** Small right-aligned metric inside a row. */
export function RowMetric({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <span className={cn('flex shrink-0 flex-col sm:items-end', className)}>
      <span className="tabular text-[15px] font-semibold">{value}</span>
      <span className="text-[12px] text-[var(--certa-muted)]">{label}</span>
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-4 py-3.5">
      <Label>{label}</Label>
      <div className="tabular mt-1.5 text-[22px] leading-tight font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[var(--certa-muted)]">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

/** Reasons a pilot/aircraft isn't fully current, with links to fix them. */
export function Reasons({ reasons, onOpen }: { reasons: ReadinessReason[]; onOpen?: (href: string) => void }) {
  if (!reasons.length) return null;
  return (
    <ul className="space-y-2">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[14px]" style={{ color: LEVEL_COLOR[r.level] }}>
          <LevelIcon level={r.level} className="mt-[3px]" />
          <span className="text-[var(--certa-text)]">
            {r.text}
            {r.due && <span className="text-[var(--certa-muted)]"> · {r.due.display}</span>}
            {r.href && onOpen && (
              <button type="button" onClick={() => onOpen(r.href!)} className="ml-2 font-semibold underline-offset-4 hover:underline">
                Fix
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Definition grid for record details. Null values render as an em dash. */
export function Facts({ items }: { items: [string, ReactNode | null | undefined][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{k}</dt>
          <dd className="mt-1 text-[15px] break-words">{v ?? <span className="text-[var(--certa-muted)]">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export function When({ d }: { d: DateDisplay | null }) {
  if (!d) return <span className="text-[var(--certa-muted)]">—</span>;
  return (
    <time dateTime={d.iso} title={d.absolute}>
      {d.display}
    </time>
  );
}

export function PendingSync() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--certa-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--certa-muted)]">
      <CloudOff className="size-3" aria-hidden /> Not synced
    </span>
  );
}

export function FlightRows({ flights, onOpen, showPilot = true, showAircraft = true }: { flights: FlightRowViewModel[]; onOpen: (id: string) => void; showPilot?: boolean; showAircraft?: boolean }) {
  return (
    <>
      {flights.map((f) => (
        <RowButton key={f.id} onClick={() => onOpen(f.id)} label={`Flight ${f.takeoff.absolute}`}>
          <RowTitle
            title={<When d={f.takeoff} />}
            sub={[showPilot && f.pilotName, showAircraft && f.aircraftName, f.locationName].filter(Boolean).join(' · ')}
            badge={f.pendingSync ? <PendingSync /> : f.source === 'import' ? <span className="rounded-full bg-[var(--certa-inset)] px-2 py-0.5 text-[11px] font-semibold text-[var(--certa-muted)]">Imported</span> : null}
          />
          <span className="flex gap-6">
            {f.maxAltitude && <RowMetric label="Max alt" value={f.maxAltitude.display} />}
            <RowMetric label="Duration" value={f.duration.display} />
          </span>
        </RowButton>
      ))}
    </>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--certa-muted)] hover:text-[var(--certa-text)]">
      <ChevronRight aria-hidden className="size-4 rotate-180" /> {label}
    </button>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-24 w-full rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-3 text-[15px] transition-[border-color,box-shadow] duration-200 focus:border-[var(--certa-text)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--certa-text)_8%,transparent)] focus:outline-none',
        props.className,
      )}
    />
  );
}

/** Optional number from a text field: '' → null. */
export const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
