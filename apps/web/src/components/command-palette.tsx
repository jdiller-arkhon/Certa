'use client';

import type { CommandItem, SearchResult } from '@certa/contract';
import { BatteryMedium, CornerDownLeft, Plane, Plus, Route, Search, Users, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { LEVEL_COLOR } from './ui/status';

const KIND_ICON: Record<SearchResult['kind'], LucideIcon> = { pilot: Users, aircraft: Plane, battery: BatteryMedium, flight: Route };
const KIND_LABEL: Record<SearchResult['kind'], string> = { pilot: 'Pilot', aircraft: 'Aircraft', battery: 'Battery', flight: 'Flight' };

type Row = { key: string; section: string; label: string; sub: string | null; href: string; shortcut: string | null; icon: LucideIcon; level: SearchResult['level'] };

/**
 * ⌘K palette: search the fleet, start an action, or jump to a page. Arrow keys move, Enter
 * opens, Escape closes. The host supplies search results for the typed query.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  results,
  onSearch,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
  results: SearchResult[];
  onSearch: (q: string) => void;
  onSelect: (href: string) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    onSearch('');
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce the host search a little; command filtering is instant.
  useEffect(() => {
    const t = setTimeout(() => onSearch(q), 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const cmds = commands
      .filter((c) => !needle || c.label.toLowerCase().includes(needle))
      .map((c) => ({ key: c.id, section: c.section, label: c.label, sub: null, href: c.href, shortcut: c.shortcut, icon: c.section === 'Actions' ? Plus : CornerDownLeft, level: null }));
    const found = needle
      ? results.map((r) => ({ key: `${r.kind}:${r.id}`, section: 'Records', label: r.title, sub: [KIND_LABEL[r.kind], r.subtitle].filter(Boolean).join(', '), href: r.href, shortcut: null, icon: KIND_ICON[r.kind], level: r.level }))
      : [];
    return [...found, ...cmds.filter((c) => c.section === 'Actions'), ...cmds.filter((c) => c.section === 'Go to')];
  }, [q, commands, results]);

  useEffect(() => setActive(0), [rows.length]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (r: Row | undefined) => {
    if (!r) return;
    onClose();
    onSelect(r.href);
  };

  if (typeof document === 'undefined') return null;
  let lastSection = '';
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="certa fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-[rgb(10_10_12/0.28)] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search and commands"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className="relative w-full max-w-[620px] overflow-hidden rounded-[20px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-lg)]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--certa-border)] px-5">
              <Search aria-hidden className="size-[18px] text-[var(--certa-muted)]" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(rows.length - 1, a + 1)));
                  else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
                  else if (e.key === 'Enter') (e.preventDefault(), choose(rows[active]));
                  else if (e.key === 'Escape') (e.preventDefault(), onClose());
                }}
                placeholder="Search pilots, aircraft, batteries, sites, or type a command"
                aria-label="Search"
                aria-controls="palette-list"
                aria-activedescendant={rows[active] ? `palette-${rows[active]!.key}` : undefined}
                role="combobox"
                aria-expanded="true"
                className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--certa-muted)]"
              />
              <kbd className="rounded-md border border-[var(--certa-border)] px-1.5 py-0.5 text-[11px] text-[var(--certa-muted)]">Esc</kbd>
            </div>
            <ul ref={list} id="palette-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
              {rows.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-[var(--certa-muted)]">Nothing matches “{q}”.</li>}
              {rows.map((r, i) => {
                const header = r.section !== lastSection ? r.section : null;
                lastSection = r.section;
                const Icon = r.icon;
                return (
                  <li key={r.key} role="presentation">
                    {header && <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">{header}</div>}
                    <div
                      id={`palette-${r.key}`}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(r)}
                      className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5', i === active && 'bg-[var(--certa-inset)]')}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--certa-border)] bg-[var(--certa-surface)]">
                        <Icon aria-hidden className="size-4 text-[var(--certa-muted)]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate text-[14px] font-semibold">
                          {r.level && <span aria-hidden className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[r.level] }} />}
                          {r.label}
                        </span>
                        {r.sub && <span className="block truncate text-[12px] text-[var(--certa-muted)]">{r.sub}</span>}
                      </span>
                      {r.shortcut && (
                        <span className="flex gap-1">
                          {r.shortcut.split(' ').map((k, j) => (
                            <kbd key={j} className="min-w-5 rounded-md border border-[var(--certa-border)] px-1.5 py-0.5 text-center text-[11px] text-[var(--certa-muted)]">{k}</kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-[var(--certa-border)] px-5 py-2.5 text-[12px] text-[var(--certa-muted)]">
              <span>↑↓ to move</span>
              <span>Enter to open</span>
              <span className="ml-auto">Press L anywhere to log a flight</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Global shortcuts: ⌘K / Ctrl+K or "/" opens the palette; "L" logs a flight; "G" then a
 * letter jumps to a page (from each command's shortcut hint). Ignored while typing.
 */
export function useShortcuts({ commands, onPalette, onNavigate }: { commands: CommandItem[]; onPalette: () => void; onNavigate: (href: string) => void }) {
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onPalette();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || !t || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('[role="dialog"]')) return;
      const key = e.key.toUpperCase();
      if (e.key === '/') {
        e.preventDefault();
        onPalette();
        return;
      }
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const hit = commands.find((c) => c.shortcut === `G ${key}`);
        if (hit) (e.preventDefault(), onNavigate(hit.href));
        return;
      }
      if (key === 'G') {
        pendingG = Date.now();
        return;
      }
      const hit = commands.find((c) => c.shortcut === key);
      if (hit) (e.preventDefault(), onNavigate(hit.href));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands, onPalette, onNavigate]);
}
