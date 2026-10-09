'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '../cn';

/** Segmented control with a sliding pill (shared layout animation). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full border border-[var(--certa-border)] bg-[var(--certa-inset)] p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-8 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--certa-focus)]',
              active ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)] hover:text-[var(--certa-text)]',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]"
              />
            )}
            <span className="relative">
              {o.label}
              {o.count !== undefined && <span className="tabular ml-1.5 text-[var(--certa-muted)]">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
