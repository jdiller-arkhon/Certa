'use client';

import type { EmptyState as EmptyStateVM } from '@certa/contract';
import { AlertCircle, Info, RotateCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Inline banner for errors and notices; animates in and out. */
export function Banner({
  tone = 'info',
  children,
  onRetry,
  onDismiss,
}: {
  tone?: 'info' | 'error' | 'warning';
  children: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const color = tone === 'error' ? 'var(--certa-expired)' : tone === 'warning' ? 'var(--certa-warning)' : 'var(--certa-info)';
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      role={tone === 'error' ? 'alert' : 'status'}
      className="overflow-hidden"
    >
      <div
        className="mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
        style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 6%, var(--certa-surface))` }}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color }} />
        <div className="flex-1 text-[var(--certa-text)]">{children}</div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
            <RotateCw className="size-3.5" aria-hidden /> Retry
          </button>
        )}
        {onDismiss && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-[var(--certa-muted)] hover:text-[var(--certa-text)]">
            <X className="size-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function Banners({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

/** Empty state: icon on a dot-grid halo, product-supplied copy, primary action. */
export function EmptyState({ empty, icon, onAction, secondary }: { empty: EmptyStateVM; icon: ReactNode; onAction?: () => void; secondary?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col items-center overflow-hidden rounded-[24px] border border-dashed border-[var(--certa-border)] px-6 py-16 text-center"
    >
      <div className="dot-grid dot-grid-fade absolute inset-0" aria-hidden />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
        className="relative mb-6 flex size-16 items-center justify-center rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] text-[var(--certa-text)] shadow-[var(--certa-shadow)]"
      >
        {icon}
      </motion.div>
      <h2 className="headline relative text-xl">{empty.title}</h2>
      <p className="relative mt-2 max-w-md text-[15px] leading-relaxed text-[var(--certa-muted)]">{empty.body}</p>
      {(empty.actionLabel && onAction) || secondary ? (
        <div className="relative mt-7 flex flex-wrap justify-center gap-2">
          {empty.actionLabel && onAction && (
            <Button arrow onClick={onAction}>
              {empty.actionLabel}
            </Button>
          )}
          {secondary}
        </div>
      ) : null}
    </motion.div>
  );
}
