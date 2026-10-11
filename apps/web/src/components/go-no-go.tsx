'use client';

import type { GoNoGoResult } from '@certa/contract';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';
import { EASE } from './motion';
import { LEVEL_COLOR, LevelIcon } from './ui/status';

const DECISION = {
  go: { label: 'Go', level: 'green', note: 'Records on file are current for this pilot, aircraft, and batteries.' },
  caution: { label: 'Caution', level: 'amber', note: 'Legal to fly, but something needs attention soon.' },
  no_go: { label: 'No-go', level: 'red', note: 'Records on file say this flight isn’t legal. You can still log it; the check is stored with the flight.' },
} as const;

/** Pre-flight go / no-go from records on file. Advisory — the pilot in command decides. */
export function GoNoGoPanel({ result, compact, className }: { result: GoNoGoResult; compact?: boolean; className?: string }) {
  const d = DECISION[result.decision];
  const color = LEVEL_COLOR[d.level];
  return (
    <section
      aria-label="Pre-flight check"
      aria-live="polite"
      className={cn('overflow-hidden rounded-[20px] border', className)}
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--certa-border))`, background: `color-mix(in srgb, ${color} 5%, var(--certa-surface))` }}
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={result.decision}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="flex size-10 items-center justify-center rounded-full text-white"
            style={{ background: color }}
          >
            <LevelIcon level={d.level} className="size-5 text-white" />
          </motion.span>
        </AnimatePresence>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">Pre-flight check</div>
          <div className="headline text-[22px] leading-tight" style={{ color }}>{d.label}</div>
        </div>
      </div>
      {!compact && <p className="px-5 pb-3 text-[13px] text-[var(--certa-muted)]">{d.note}</p>}
      <ul className="border-t border-[color-mix(in_srgb,var(--certa-border)_70%,transparent)]">
        {result.checks.map((c, i) => (
          <motion.li
            key={c.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04, duration: 0.35, ease: EASE } }}
            className="flex items-start gap-2.5 border-b border-[color-mix(in_srgb,var(--certa-border)_70%,transparent)] px-5 py-2.5 last:border-b-0"
          >
            <span className="mt-[3px]" style={{ color: LEVEL_COLOR[c.level] }}><LevelIcon level={c.level} /></span>
            <span className="min-w-0 text-[14px]">
              <span className="font-semibold">{c.label}</span>
              <span className="block text-[13px] text-[var(--certa-muted)]">{c.detail}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
