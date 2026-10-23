'use client';

import type { HelpFlagVM, PlatformChartMonthVM, PlatformKpiVM, PlatformPeriodPreset, PlatformPeriodVM, ReadinessLevel } from '@certa/contract';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/components/cn';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { LEVEL_COLOR, LevelIcon } from '@/components/ui/status';

/** Preset ranges plus a custom from/to, in one row above the figures. */
export function PeriodPicker({
  period,
  presets,
  onPreset,
  onCustom,
}: {
  period: PlatformPeriodVM;
  presets: { id: PlatformPeriodPreset; label: string }[];
  onPreset: (p: PlatformPeriodPreset) => void;
  onCustom: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  useEffect(() => {
    setFrom(period.from);
    setTo(period.to);
  }, [period.from, period.to]);
  const apply = (f: string, t: string) => {
    if (f && t && f <= t && (f !== period.from || t !== period.to)) onCustom(f, t);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<PlatformPeriodPreset | 'custom'>
        label="Period"
        value={period.preset}
        options={[...presets.map((p) => ({ value: p.id, label: p.label })), ...(period.preset === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : [])]}
        onChange={(v) => v !== 'custom' && onPreset(v)}
      />
      <div className="flex items-center gap-2 text-[13px] text-[var(--certa-muted)]">
        <label className="sr-only" htmlFor="period-from">From</label>
        <Input id="period-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} onBlur={() => apply(from, to)} className="h-10 w-[150px] text-[14px]" />
        <span aria-hidden>–</span>
        <label className="sr-only" htmlFor="period-to">To</label>
        <Input id="period-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} onBlur={() => apply(from, to)} className="h-10 w-[150px] text-[14px]" />
      </div>
    </div>
  );
}

/** A grid of figure tiles; tiles with a link open the page behind the number. */
export function KpiGrid({ items, onNavigate, columns = 4 }: { items: PlatformKpiVM[]; onNavigate: (href: string) => void; columns?: 2 | 4 }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-border)]', columns === 4 && 'lg:grid-cols-4')}>
      {items.map((k) => {
        const body = (
          <>
            <dt className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">
              {k.level && k.level !== 'green' && <LevelIcon level={k.level} className="size-3" />}
              <span style={k.level && k.level !== 'green' ? { color: LEVEL_COLOR[k.level] } : undefined}>{k.label}</span>
              {k.href && <ArrowUpRight aria-hidden className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
            </dt>
            <dd className="headline tabular mt-2 text-[28px] leading-none sm:text-[32px]">{k.value}</dd>
            {k.hint && <dd className="mt-1.5 text-[13px] text-[var(--certa-muted)]">{k.hint}</dd>}
          </>
        );
        return k.href ? (
          <button key={k.id} type="button" onClick={() => onNavigate(k.href!)} className="group bg-[var(--certa-surface)] px-5 py-4 text-left transition-colors hover:bg-[var(--certa-inset)]">
            {body}
          </button>
        ) : (
          <div key={k.id} className="bg-[var(--certa-surface)] px-5 py-4">
            {body}
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Monthly flight hours: one series, so no legend; the panel title names it. Thin bars with
 * rounded tops on a recessive grid, a hover tooltip per bar, and months outside the selected
 * period dimmed. A screen-reader table carries the same numbers.
 */
export function HoursChart({ months, caption }: { months: PlatformChartMonthVM[]; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => m.hours));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 8, t: 12, b: 26 };
  const cw = (W - pad.l - pad.r) / months.length;
  const bw = Math.min(28, cw * 0.56);
  const y = (h: number) => pad.t + (H - pad.t - pad.b) * (1 - h / top);
  const h = hover != null ? months[hover] : null;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--certa-border)" strokeWidth={1} strokeDasharray={t ? '2 4' : undefined} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize={11} fill="var(--certa-muted)">
              {t}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = pad.l + cw * i + (cw - bw) / 2;
          const bh = Math.max(0, y(0) - y(m.hours));
          const r = Math.min(4, bh);
          return (
            <g key={m.key}>
              {bh > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(m.hours) + r} Q${x},${y(m.hours)} ${x + r},${y(m.hours)} H${x + bw - r} Q${x + bw},${y(m.hours)} ${x + bw},${y(m.hours) + r} V${y(0)} Z`}
                  fill="var(--certa-text)"
                  opacity={hover === i ? 1 : m.inPeriod ? 0.82 : 0.28}
                />
              )}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={hover === i ? 'var(--certa-text)' : 'var(--certa-muted)'}>
                {m.label}
              </text>
              {/* Hit target: the whole column, bigger than the bar. */}
              <rect x={pad.l + cw * i} y={pad.t} width={cw} height={H - pad.t - pad.b + 20} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${m.longLabel}: ${m.hoursDisplay}, ${m.flights} flights`} />
            </g>
          );
        })}
      </svg>
      {h && hover != null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 min-w-[160px] -translate-x-1/2 rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 py-2 text-[13px] shadow-[var(--certa-shadow)]"
          style={{ left: `${((pad.l + cw * hover + cw / 2) / W) * 100}%` }}
        >
          <p className="font-semibold">{h.longLabel}</p>
          <p className="tabular text-[var(--certa-muted)]">
            {h.hoursDisplay} · {h.flights} flight{h.flights === 1 ? '' : 's'}
          </p>
          <p className="tabular text-[var(--certa-muted)]">
            {h.pilotsFlown} pilot{h.pilotsFlown === 1 ? '' : 's'}
            {h.argusFlights ? ` · ${h.argusFlights} from Argus` : ''}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Hours</th>
            <th>Flights</th>
            <th>Pilots flown</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <td>{m.longLabel}</td>
              <td>{m.hoursDisplay}</td>
              <td>{m.flights}</td>
              <td>{m.pilotsFlown}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag) || 1;
}

/** Readiness split as one segmented bar with labelled counts (icon + text, never color alone). */
export function ReadinessBar({ parts }: { parts: { level: ReadinessLevel; label: string; count: number; share: number }[] }) {
  const total = parts.reduce((s, p) => s + p.count, 0);
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-[var(--certa-inset)]">
        {total > 0 && parts.filter((p) => p.count).map((p) => <div key={p.level} style={{ width: `${p.share * 100}%`, background: LEVEL_COLOR[p.level] }} title={`${p.label}: ${p.count}`} />)}
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <li key={p.level} className="space-y-1">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: LEVEL_COLOR[p.level] }}>
              <LevelIcon level={p.level} className="size-3" />
              {p.label}
            </span>
            <span className="headline tabular block text-[24px] leading-none">{p.count}</span>
            <span className="tabular text-[12px] text-[var(--certa-muted)]">{total ? `${Math.round(p.share * 100)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlagChip({ flag, size = 'md' }: { flag: HelpFlagVM; size?: 'sm' | 'md' }) {
  const color = LEVEL_COLOR[flag.level];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap', size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12.5px]')}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 7%, var(--certa-surface))` }}
    >
      <LevelIcon level={flag.level} className="size-3" />
      {flag.label}
    </span>
  );
}

/** Small text-on-tone label for non-level facts (e.g. "Argus", "Discord"). */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-[var(--certa-border)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--certa-muted)]">{children}</span>;
}
