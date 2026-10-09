'use client';

import { motion } from 'motion/react';
import type { ReadinessLevel } from '@certa/contract';
import { CountUp, EASE } from './motion';
import { LEVEL_COLOR } from './ui/status';

/**
 * Readiness ring: green/amber/red arcs proportional to counts, drawn in sequence on load.
 * The center shows the total tracked. Arcs are decorative; counts are also given as text.
 */
export function ReadinessRing({ counts, size = 220 }: { counts: Record<ReadinessLevel, number>; size?: number }) {
  const total = counts.green + counts.amber + counts.red;
  const r = 42;
  const gap = total > 1 ? 1.6 : 0; // % of circumference between segments
  const segs: { level: ReadinessLevel; from: number; len: number }[] = [];
  let at = 0;
  for (const level of ['green', 'amber', 'red'] as const) {
    if (!counts[level]) continue;
    const len = (counts[level] / Math.max(total, 1)) * 100;
    segs.push({ level, from: at, len: Math.max(len - gap, 0.5) });
    at += len;
  }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--certa-inset)" strokeWidth="7" />
        {segs.map((s, i) => (
          <motion.circle
            key={s.level}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={LEVEL_COLOR[s.level]}
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDashoffset={-s.from}
            initial={{ strokeDasharray: '0 100' }}
            animate={{ strokeDasharray: `${s.len} ${100 - s.len}` }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.25 }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={total} className="headline tabular text-5xl" />
        <span className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">Tracked</span>
      </div>
    </div>
  );
}
