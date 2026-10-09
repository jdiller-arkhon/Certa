'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../cn';

const control =
  'w-full rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 text-[15px] text-[var(--certa-text)] ' +
  'placeholder:text-[color-mix(in_srgb,var(--certa-muted)_70%,transparent)] transition-[border-color,box-shadow] duration-200 ' +
  'hover:border-[color-mix(in_srgb,var(--certa-text)_35%,var(--certa-border))] ' +
  'focus:border-[var(--certa-text)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--certa-text)_8%,transparent)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-[var(--certa-inset)] disabled:text-[var(--certa-muted)] aria-[invalid=true]:border-[var(--certa-expired)]';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const described = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-[var(--certa-text)]">
        {label}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p key="err" id={`${id}-err`} role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-[13px] text-[var(--certa-expired)]">
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" id={`${id}-hint`} className="text-[13px] text-[var(--certa-muted)]">
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }>(function Input(
  { className, suffix, ...rest },
  ref,
) {
  if (!suffix) return <input ref={ref} className={cn(control, 'h-12', className)} {...rest} />;
  return (
    <div className="relative">
      <input ref={ref} className={cn(control, 'h-12 pr-14', className)} {...rest} />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium text-[var(--certa-muted)]">{suffix}</span>
    </div>
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-[var(--certa-muted)]" />
    </div>
  );
}

/** Animated switch (role=switch). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-300 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--certa-focus)] disabled:opacity-50',
        checked ? 'border-[var(--certa-action)] bg-[var(--certa-action)]' : 'border-[var(--certa-border)] bg-[var(--certa-inset)]',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cn('block size-5 rounded-full shadow-[var(--certa-shadow-sm)]', checked ? 'ml-[22px] bg-[var(--certa-onAction)]' : 'ml-[3px] bg-[var(--certa-surface)]')}
      />
    </button>
  );
}
