import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Pill eyebrow with a leading dot — "● INTRODUCING ARGUS" on the Arkhon site. */
export function Eyebrow({ children, className, live }: { children: ReactNode; className?: string; live?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase',
        className,
      )}
    >
      <span className="relative flex size-1.5">
        {live && <span className="ping absolute inset-0 rounded-full bg-[var(--certa-text)]" />}
        <span className="relative size-1.5 rounded-full bg-[var(--certa-text)]" />
      </span>
      {children}
    </span>
  );
}

/** Small uppercase section label. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase', className)}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="headline text-[32px] leading-[1.1] sm:text-[40px]">{title}</h1>
        {description && <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--certa-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
