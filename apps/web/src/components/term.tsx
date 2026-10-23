'use client';

import { glossary } from '@certa/core';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A jargon word with its plain-language meaning one tap away: dotted underline, tap or hover
 * to show the definition, Escape or tap elsewhere to close. Falls back to plain text for an
 * unknown id.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const entry = glossary(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tip = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  if (!entry) return <>{children}</>;
  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        aria-describedby={open ? tip : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="cursor-help underline decoration-[var(--certa-muted)] decoration-dotted underline-offset-4 hover:decoration-[var(--certa-text)]"
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span
          id={tip}
          role="tooltip"
          className="absolute top-full left-0 z-50 mt-2 block w-[min(18rem,80vw)] rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2.5 text-left text-[13px] leading-snug font-normal tracking-normal text-[var(--certa-text)] normal-case shadow-[var(--certa-shadow)]"
        >
          <span className="mb-0.5 block font-semibold">{entry.term}</span>
          {entry.short}
        </span>
      )}
    </span>
  );
}
