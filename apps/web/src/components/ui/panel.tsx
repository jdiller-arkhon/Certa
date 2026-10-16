import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * The Arkhon site's data card: a header strip with a small label and a right-hand meta, then
 * divided rows. Used for every data surface in the ops console so screens read as one system.
 */
export function Panel({ label, meta, children, className, bodyClassName, id }: { label: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} aria-label={typeof label === 'string' ? label : undefined} className={cn('overflow-hidden rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]', className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--certa-border)] px-5 py-3">
        <h2 className="text-[12px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">{label}</h2>
        {meta && <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-[var(--certa-muted)]">{meta}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A label / value line inside a panel (value right-aligned, tabular). */
export function PanelRow({ label, value, dot, onClick }: { label: ReactNode; value: ReactNode; dot?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2.5 text-[14px]">
        {dot && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular shrink-0 text-right text-[14px] text-[var(--certa-muted)]">{value}</span>
    </>
  );
  const cls = 'flex w-full items-center justify-between gap-4 px-5 py-2.5';
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'text-left transition-colors hover:bg-[var(--certa-inset)]')}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** The site's stat strip: big tabular numbers with small labels, evenly spaced. */
export function StatStrip({ items }: { items: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <dl className="grid border-b border-[var(--certa-border)]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1 px-2 py-4 text-center">
          <dd className="headline tabular text-[30px] leading-none" style={s.color ? { color: s.color } : undefined}>{s.value}</dd>
          <dt className="text-[12px] text-[var(--certa-muted)]">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}
