'use client';

import type { GettingStartedViewModel } from '@certa/contract';
import { ArrowRight, Check, X } from 'lucide-react';
import { cn } from './cn';

/** The first-run checklist: each step ticks off from the pilot's records and opens its screen. */
export function GettingStarted({ model, onOpen, onDismiss, compact }: { model: GettingStartedViewModel; onOpen: (href: string) => void; onDismiss?: () => void; compact?: boolean }) {
  const next = model.steps.find((s) => !s.done);
  return (
    <section aria-label="Getting started" className="overflow-hidden rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--certa-border)] px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[12px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">Getting started</h2>
          <span className="tabular text-[12px] font-semibold text-[var(--certa-muted)]">
            {model.doneCount} of {model.steps.length} done
          </span>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Hide getting started" className="rounded-full p-1 text-[var(--certa-muted)] hover:bg-[var(--certa-inset)] hover:text-[var(--certa-text)]">
            <X className="size-4" />
          </button>
        )}
      </header>
      <div className="h-1 bg-[var(--certa-inset)]" aria-hidden>
        <div className="h-full bg-[var(--certa-current)] transition-[width] duration-500" style={{ width: `${(model.doneCount / model.steps.length) * 100}%` }} />
      </div>
      <ol className="divide-y divide-[var(--certa-border)]">
        {model.steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.href)}
                className={cn('flex w-full items-start gap-4 px-5 text-left transition-colors hover:bg-[var(--certa-inset)]', compact ? 'py-3' : 'py-4', isNext && 'bg-[color-mix(in_srgb,var(--certa-inset)_60%,transparent)]')}
              >
                <span
                  className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold', s.done ? 'border-transparent bg-[var(--certa-current)] text-white' : isNext ? 'border-[var(--certa-text)]' : 'border-[var(--certa-border)] text-[var(--certa-muted)]')}
                  aria-hidden
                >
                  {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[15px] font-semibold', s.done && 'text-[var(--certa-muted)] line-through decoration-1')}>
                    {s.title}
                    <span className="sr-only">{s.done ? ' (done)' : ''}</span>
                  </span>
                  {!s.done && !compact && <span className="mt-0.5 block text-[13.5px] text-[var(--certa-muted)]">{s.body}</span>}
                </span>
                {!s.done && (
                  <span className={cn('mt-0.5 hidden shrink-0 items-center gap-1 text-[13px] font-semibold sm:inline-flex', isNext ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)]')}>
                    {s.action} <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
