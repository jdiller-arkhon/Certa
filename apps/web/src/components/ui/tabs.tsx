'use client';

import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../cn';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Selected tab, mirrored to the URL hash (#credentials) so a tab can be linked to and the
 * back button returns to it. The first tab is the default and carries no hash.
 */
export function useHashTab<T extends string>(ids: readonly T[]) {
  const [tab, setTab] = useState<T>(ids[0]!);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as T;
      setTab(ids.includes(h) ? h : ids[0]!);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [ids.join(',')]);
  const select = (t: T) => {
    setTab(t);
    const url = `${window.location.pathname}${window.location.search}${t === ids[0] ? '' : `#${t}`}`;
    window.history.replaceState(window.history.state, '', url);
  };
  return [tab, select] as const;
}

/**
 * Underlined tab strip in the Arkhon style: small semibold labels, a sliding ink bar, and
 * counts in muted tabular figures. Arrow keys, Home and End move between tabs.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, className }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; label: string; className?: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n]!.id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--certa-border)] px-1 [scrollbar-width:none]', className)}>
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i + 1);
              else if (e.key === 'ArrowLeft') move(i - 1);
              else if (e.key === 'Home') move(0);
              else if (e.key === 'End') move(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={cn(
              'relative flex h-11 shrink-0 items-center gap-2 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--certa-focus)]',
              active ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)] hover:text-[var(--certa-text)]',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="tabular text-[12px] font-semibold text-[var(--certa-muted)]">{t.count}</span>}
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--certa-text)]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}

/** The panel for the selected tab, named after it. Keyed by the tab so it fades in on switch. */
export function TabPanel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <motion.div role="tabpanel" aria-label={label} tabIndex={-1} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={className}>
      {children}
    </motion.div>
  );
}
