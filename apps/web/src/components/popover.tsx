'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

/** Lightweight anchored menu: springs open, closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            style={{ transformOrigin: `${side === 'bottom' ? 'top' : 'bottom'} ${align === 'start' ? 'left' : 'right'}` }}
            className={cn(
              'absolute z-40 min-w-56 rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] p-1.5 shadow-[var(--certa-shadow-lg)]',
              side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
              align === 'start' ? 'left-0' : 'right-0',
              className,
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ children, onSelect, active, icon }: { children: ReactNode; onSelect: () => void; active?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--certa-inset)] focus-visible:bg-[var(--certa-inset)] focus-visible:outline-none',
        active && 'font-semibold',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}
