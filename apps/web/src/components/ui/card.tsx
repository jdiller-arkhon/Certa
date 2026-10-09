'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '../cn';

/** Soft panel. `interactive` lifts on hover like the cards on the Arkhon site. */
export function Card({ interactive, className, ...rest }: HTMLMotionProps<'div'> & { interactive?: boolean }) {
  return (
    <motion.div
      whileHover={interactive ? { y: -2, boxShadow: 'var(--certa-shadow-lg)' } : undefined}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-[20px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]',
        className,
      )}
      {...rest}
    />
  );
}
