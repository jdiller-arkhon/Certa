'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'group relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap ' +
  'transition-[background-color,color,border-color,box-shadow,opacity] duration-200 ease-[var(--certa-ease)] ' +
  'focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--certa-focus)] ' +
  'disabled:pointer-events-none disabled:opacity-45';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--certa-action)] text-[var(--certa-onAction)] shadow-[var(--certa-shadow)] hover:opacity-90',
  secondary: 'border border-[var(--certa-border)] bg-[var(--certa-surface)] text-[var(--certa-text)] hover:bg-[var(--certa-inset)]',
  ghost: 'text-[var(--certa-text)] hover:bg-[var(--certa-inset)]',
  danger: 'border border-[var(--certa-border)] bg-[var(--certa-surface)] text-[var(--certa-expired)] hover:bg-[color-mix(in_srgb,var(--certa-expired)_8%,transparent)]',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  /** Trailing arrow that nudges on hover, like the Arkhon site's CTAs. */
  arrow?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', arrow, icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {arrow && (
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform duration-300 ease-[var(--certa-ease)] group-hover:translate-x-0.5"
        />
      )}
    </motion.button>
  );
});

export function IconButton({ label, className, children, ...rest }: Omit<HTMLMotionProps<'button'>, 'children'> & { label: string; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full text-[var(--certa-muted)] transition-colors duration-200 hover:bg-[var(--certa-inset)] hover:text-[var(--certa-text)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--certa-focus)]',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
