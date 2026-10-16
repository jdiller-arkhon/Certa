'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Present = sortable by this value. */
  sort?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  /** Hide on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  onRun: (ids: string[]) => void;
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

function readSort(id: string): Sort | undefined {
  try {
    const v = localStorage.getItem(`certa.table.${id}`);
    return v ? (JSON.parse(v) as Sort) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The ops-console table, dressed as an Arkhon panel: a header strip, sortable columns (the
 * chosen sort is remembered per table on this device), row selection with a floating bulk-
 * action bar, and whole-row navigation. Presentational: rows and actions come from props.
 */
export function DataTable<T>({
  id,
  label,
  meta,
  toolbar,
  rows,
  rowKey,
  columns,
  onOpen,
  openLabel,
  bulkActions,
  defaultSort = null,
  empty,
  footer,
}: {
  id: string;
  label: string;
  meta?: ReactNode;
  toolbar?: ReactNode;
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  onOpen?: (row: T) => void;
  openLabel?: (row: T) => string;
  bulkActions?: BulkAction[];
  defaultSort?: Sort;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState<Sort>(defaultSort);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    const saved = readSort(id);
    if (saved !== undefined) setSort(saved);
  }, [id]);
  const changeSort = (key: string) => {
    const next: Sort = sort?.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null;
    setSort(next);
    try {
      localStorage.setItem(`certa.table.${id}`, JSON.stringify(next));
    } catch {}
  };

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const k = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * k;
    });
  }, [rows, sort, columns]);

  // Drop selections that are no longer visible (filters changed, rows removed).
  const keys = useMemo(() => new Set(rows.map(rowKey)), [rows, rowKey]);
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((k) => keys.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [keys]);

  const selectable = !!bulkActions?.length;
  const allOn = selectable && rows.length > 0 && selected.size === rows.length;
  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  return (
    <section aria-label={label} className="overflow-hidden rounded-[18px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--certa-border)] px-5 py-3">
        <h2 className="text-[12px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">{label}</h2>
        <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-[var(--certa-muted)]">{meta ?? <span className="tabular">{rows.length}</span>}</div>
      </header>
      {toolbar && <div className="flex flex-col gap-3 border-b border-[var(--certa-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">{toolbar}</div>}
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-[14px] text-[var(--certa-muted)]">{empty ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--certa-border)]">
                {selectable && (
                  <th scope="col" className="w-12 py-2.5 pl-5">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.size > 0 && !allOn;
                      }}
                      onChange={() => setSelected(allOn ? new Set() : new Set(rows.map(rowKey)))}
                      className="size-4 accent-[var(--certa-action)]"
                    />
                  </th>
                )}
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  const Icon = !active ? ChevronsUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn('px-4 py-2.5 text-[11px] font-semibold tracking-[0.1em] text-[var(--certa-muted)] uppercase first-of-type:pl-5', c.align === 'right' && 'text-right', c.hideBelow && HIDE[c.hideBelow])}
                    >
                      {c.sort ? (
                        <button type="button" onClick={() => changeSort(c.key)} className={cn('inline-flex items-center gap-1 uppercase hover:text-[var(--certa-text)]', active && 'text-[var(--certa-text)]', c.align === 'right' && 'flex-row-reverse')}>
                          {c.header}
                          <Icon aria-hidden className={cn('size-3', !active && 'opacity-40')} />
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
                {onOpen && <th scope="col" className="w-10"><span className="sr-only">Open</span></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const k = rowKey(row);
                const on = selected.has(k);
                return (
                  <tr
                    key={k}
                    onClick={onOpen ? () => onOpen(row) : undefined}
                    className={cn('group border-b border-[var(--certa-border)] transition-colors last:border-b-0', onOpen && 'cursor-pointer hover:bg-[var(--certa-inset)]', on && 'bg-[color-mix(in_srgb,var(--certa-inset)_70%,transparent)]')}
                  >
                    {selectable && (
                      <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${openLabel?.(row) ?? k}`} checked={on} onChange={() => toggle(k)} className="size-4 accent-[var(--certa-action)]" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3 align-middle text-[14px] first-of-type:pl-5', c.align === 'right' && 'tabular text-right', c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {c.render(row)}
                      </td>
                    ))}
                    {onOpen && (
                      <td className="pr-4">
                        <button
                          type="button"
                          aria-label={openLabel ? openLabel(row) : 'Open'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(row);
                          }}
                          className="flex size-8 items-center justify-center rounded-full text-[var(--certa-muted)] transition-transform group-hover:translate-x-0.5 hover:text-[var(--certa-text)]"
                        >
                          <svg aria-hidden viewBox="0 0 16 16" className="size-4"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {footer}
      {selectable && typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selected.size > 0 && (
              <motion.div
                role="toolbar"
                aria-label="Bulk actions"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="certa fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-8"
              >
                <div className="flex items-center gap-1 rounded-full bg-[var(--certa-action)] py-1.5 pr-1.5 pl-5 text-[var(--certa-onAction)] shadow-[var(--certa-shadow-lg)]">
                  <span className="tabular mr-2 text-[14px] font-semibold whitespace-nowrap">{selected.size} selected</span>
                  {bulkActions!.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        a.onRun([...selected]);
                        setSelected(new Set());
                      }}
                      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors hover:bg-white/15', a.tone === 'danger' && 'text-[#ffb4ae]')}
                    >
                      {a.icon}
                      {a.label}
                    </button>
                  ))}
                  <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="ml-1 flex size-9 items-center justify-center rounded-full hover:bg-white/15">
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </section>
  );
}
