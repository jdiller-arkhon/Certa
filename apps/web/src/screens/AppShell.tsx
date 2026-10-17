'use client';

import type { AppShellProps, NavItem, ThemeName } from '@certa/contract';
import {
  BatteryMedium,
  BookOpenCheck,
  Briefcase,
  Check,
  ChartLine,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Cloud,
  CloudOff,
  Ellipsis,
  History,
  KeyRound,
  LogOut,
  Moon,
  Plane,
  Plus,
  Radar,
  RefreshCw,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  SunMedium,
  TriangleAlert,
  UserCog,
  Users,
  Umbrella,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useState, type ReactNode } from 'react';
import { CommandPalette, useShortcuts } from '@/components/command-palette';
import { cn } from '@/components/cn';
import { CertaLogo } from '@/components/brand';
import { EASE } from '@/components/motion';
import { MenuItem, Popover } from '@/components/popover';
import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { LEVEL_COLOR } from '@/components/ui/status';

const BY_ID: Record<string, LucideIcon> = { rules: BookOpenCheck, members: UserCog, audit: History, integrations: KeyRound };
const BY_ICON: Record<NavItem['icon'], LucideIcon> = {
  today: Radar,
  flights: Route,
  pilots: Users,
  aircraft: Plane,
  batteries: BatteryMedium,
  maintenance: Wrench,
  insurance: Umbrella,
  missions: Briefcase,
  incidents: TriangleAlert,
  records: ScrollText,
  analytics: ChartLine,
  settings: Settings,
  admin: ShieldCheck,
};
const iconFor = (n: NavItem) => BY_ID[n.id] ?? BY_ICON[n.icon];

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sunlight', label: 'Sunlight' },
];

function Wordmark({ compact }: { compact?: boolean }) {
  return <CertaLogo height={compact ? 26 : 30} endorsed={!compact} />;
}

function SyncChip({ sync, onSyncNow }: Pick<AppShellProps, 'sync' | 'onSyncNow'>) {
  const offline = sync.status === 'offline';
  const syncing = sync.status === 'syncing';
  const error = sync.status === 'error';
  const label = offline ? 'Offline' : syncing ? 'Syncing' : error ? 'Sync failed' : sync.pendingChanges ? `${sync.pendingChanges} pending` : 'All synced';
  const color = error ? 'var(--certa-expired)' : offline ? 'var(--certa-pending)' : 'var(--certa-current)';
  const Icon = offline ? CloudOff : syncing ? RefreshCw : Cloud;
  return (
    <button
      type="button"
      onClick={onSyncNow}
      title={sync.message ?? 'Sync now'}
      aria-label={label}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--certa-border)] px-2.5 text-[12px] font-semibold whitespace-nowrap text-[var(--certa-muted)] transition-colors hover:text-[var(--certa-text)]"
    >
      <Icon aria-hidden className={cn('size-3.5', syncing && 'animate-spin')} style={{ color }} />
      {/* Quiet when all is well; words only when something needs attention. */}
      <span className={cn(!offline && !syncing && !error && !sync.pendingChanges && 'sr-only')}>{label}</span>
      {sync.conflictCount > 0 && (
        <span className="rounded-full px-1.5 text-[11px] text-[var(--certa-onAction)]" style={{ background: 'var(--certa-warning)' }}>
          {sync.conflictCount}
        </span>
      )}
    </button>
  );
}

function OrgSwitcher(props: AppShellProps) {
  const multiple = props.orgOptions.length > 1;
  return (
    <Popover
      trigger={(t) => (
        <button
          type="button"
          onClick={multiple ? t.toggle : undefined}
          aria-expanded={multiple ? t['aria-expanded'] : undefined}
          aria-haspopup={multiple ? 'menu' : undefined}
          className={cn(
            'flex h-11 w-full max-w-[260px] items-center gap-2.5 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] py-1.5 pr-3 pl-1.5 text-left transition-colors',
            multiple && 'hover:bg-[var(--certa-inset)]',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--certa-action)] text-[13px] font-bold text-[var(--certa-onAction)]">
            {props.organization.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span data-testid="org-name" className="block truncate text-[13px] leading-tight font-semibold">
              {props.organization.name}
            </span>
            <span className="block truncate text-[11px] leading-tight text-[var(--certa-muted)]">{props.user.roleLabel}</span>
          </span>
          {multiple && <ChevronsUpDown aria-hidden className="size-4 text-[var(--certa-muted)]" />}
        </button>
      )}
      className="w-72"
    >
      {(close) =>
        props.orgOptions.map((o) => (
          <MenuItem
            key={o.orgId}
            active={o.current}
            icon={<Check aria-hidden className={cn('size-4', !o.current && 'invisible')} />}
            onSelect={() => {
              close();
              if (!o.current) props.onSwitchOrg(o.orgId);
            }}
          >
            {o.name}
          </MenuItem>
        ))
      }
    </Popover>
  );
}

function NavLink({ item, basePath, onNavigate, layoutGroup }: { item: NavItem; basePath: string; onNavigate: (href: string) => void; layoutGroup: string }) {
  const Icon = iconFor(item);
  return (
    <a
      href={basePath + item.href}
      aria-current={item.active ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(item.href);
      }}
      className={cn(
        'relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors duration-200',
        item.active ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)] hover:text-[var(--certa-text)]',
      )}
    >
      {item.active && (
        <motion.span
          layoutId={layoutGroup}
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          className="absolute inset-0 rounded-xl border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-sm)]"
        />
      )}
      <Icon aria-hidden className="relative size-[18px]" strokeWidth={item.active ? 2.2 : 1.8} />
      <span className="relative flex-1">{item.label}</span>
      {item.badge && (
        <span className="relative rounded-full px-1.5 py-px text-[11px] font-bold" style={{ background: LEVEL_COLOR[item.badge.level], color: 'var(--certa-canvas)' }}>
          {item.badge.text}
        </span>
      )}
    </a>
  );
}

function UserMenu(props: AppShellProps & { side?: 'top' | 'bottom'; align?: 'start' | 'end'; compact?: boolean }) {
  return (
    <Popover
      side={props.side ?? 'top'}
      align={props.align ?? 'start'}
      trigger={(t) => (
        <button
          type="button"
          onClick={t.toggle}
          aria-expanded={t['aria-expanded']}
          aria-haspopup="true"
          aria-label="Account menu"
          className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-[var(--certa-inset)]"
        >
          <Avatar user={props.user} size={34} />
          {!props.compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{props.user.name}</span>
              <span className="block truncate text-[12px] text-[var(--certa-muted)]">{props.user.email}</span>
            </span>
          )}
        </button>
      )}
      className="w-72"
    >
      {(close) => (
        <div className="space-y-1">
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">Appearance</div>
          <div className="px-2 pb-2">
            <Segmented label="Theme" value={props.theme} options={THEMES} onChange={props.onThemeChange} className="w-full justify-between" />
          </div>
          <div className="h-px bg-[var(--certa-border)]" />
          <MenuItem
            icon={<LogOut aria-hidden className="size-4" />}
            onSelect={() => {
              close();
              props.onSignOut();
            }}
          >
            Sign out
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

const TAB_IDS = ['today', 'flights', 'aircraft'];
const GROUP_LABEL: Record<NavItem['group'], string> = { operations: '', fleet: 'Fleet', upkeep: 'Upkeep', admin: 'Admin' };

function TopLink({ item, basePath, onNavigate }: { item: NavItem } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
  return (
    <a
      href={basePath + item.href}
      aria-current={item.active ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(item.href);
      }}
      className={cn('relative flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[15px] transition-colors duration-200', item.active ? 'font-semibold text-[var(--certa-text)]' : 'text-[var(--certa-muted)] hover:text-[var(--certa-text)]')}
    >
      {item.label}
      {item.badge && <span className="rounded-full px-1.5 py-px text-[11px] font-bold" style={{ background: LEVEL_COLOR[item.badge.level], color: 'var(--certa-canvas)' }}>{item.badge.text}</span>}
    </a>
  );
}

/** A top-bar group (Fleet, Upkeep, Admin) that opens a menu of its pages. */
function GroupMenu({ label, items, basePath, onNavigate }: { label: string; items: NavItem[] } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
  const active = items.some((n) => n.active);
  return (
    <Popover
      className="w-60"
      trigger={(t) => (
        <button
          type="button"
          onClick={t.toggle}
          aria-expanded={t['aria-expanded']}
          aria-haspopup="true"
          className={cn('flex h-9 items-center gap-1 rounded-full px-3.5 text-[15px] transition-colors duration-200', active ? 'font-semibold text-[var(--certa-text)]' : 'text-[var(--certa-muted)] hover:text-[var(--certa-text)]')}
        >
          {label}
          <ChevronDown aria-hidden className={cn('size-4 transition-transform duration-200', t.open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <ul>
          {items.map((n) => {
            const Icon = iconFor(n);
            return (
              <li key={n.id}>
                <a
                  href={basePath + n.href}
                  aria-current={n.active ? 'page' : undefined}
                  onClick={(e) => {
                    close();
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    onNavigate(n.href);
                  }}
                  className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--certa-inset)]', n.active && 'font-semibold')}
                >
                  <Icon aria-hidden className="size-4 text-[var(--certa-muted)]" />
                  <span className="flex-1">{n.label}</span>
                  {n.badge && <span className="rounded-full px-1.5 py-px text-[11px] font-bold" style={{ background: LEVEL_COLOR[n.badge.level], color: 'var(--certa-canvas)' }}>{n.badge.text}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}

/** Under the bar: the sibling pages of the current group, as on the Arkhon site's section tabs. */
function SubNav({ items, basePath, onNavigate }: { items: NavItem[] } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
  return (
    <nav aria-label="Section" className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1">
      {items.map((n) => (
        <a
          key={n.id}
          href={basePath + n.href}
          aria-current={n.active ? 'page' : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            onNavigate(n.href);
          }}
          className={cn(
            'relative inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[14px] transition-colors',
            n.active ? 'border-[var(--certa-text)] bg-[var(--certa-surface)] font-semibold text-[var(--certa-text)]' : 'border-transparent text-[var(--certa-muted)] hover:border-[var(--certa-border)] hover:text-[var(--certa-text)]',
          )}
        >
          {n.label}
        </a>
      ))}
    </nav>
  );
}

function SearchPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search and commands"
      className="hidden h-11 w-52 items-center gap-2.5 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] pr-2 pl-4 text-[14px] text-[var(--certa-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--certa-text)_35%,var(--certa-border))] xl:flex"
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded-md border border-[var(--certa-border)] px-1.5 py-0.5 text-[11px]">⌘K</kbd>
    </button>
  );
}

export function AppShell(props: AppShellProps & { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useShortcuts({ commands: props.commands, onPalette: openPalette, onNavigate: props.onNavigate });
  const active = props.navigation.find((n) => n.active);
  const ops = props.navigation.filter((n) => n.group === 'operations');
  const groups = (['fleet', 'upkeep', 'admin'] as const).map((g) => ({ g, items: props.navigation.filter((n) => n.group === g) })).filter((x) => x.items.length);
  const siblings = active && active.group !== 'operations' ? props.navigation.filter((n) => n.group === active.group) : [];
  const canLog = props.commands.some((c) => c.id === 'log-flight');
  const tabs = TAB_IDS.map((id) => props.navigation.find((n) => n.id === id)).filter((n): n is NavItem => !!n);
  const rest = props.navigation.filter((n) => !TAB_IDS.includes(n.id));

  return (
    <div className="certa min-h-dvh" data-testid="app-shell">
      <header className="safe-top sticky top-0 z-30 border-b border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-canvas)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:gap-5 lg:px-8">
          <a
            href={props.basePath + '/'}
            aria-label="Certa home"
            onClick={(e) => {
              e.preventDefault();
              props.onNavigate('/');
            }}
            className="shrink-0"
          >
            <Wordmark compact />
          </a>
          <div className="hidden lg:block">
            <OrgSwitcher {...props} />
          </div>
          <nav aria-label="Main" className="hidden items-center lg:flex">
            {ops.map((n) => <TopLink key={n.id} item={n} basePath={props.basePath} onNavigate={props.onNavigate} />)}
            {groups.map(({ g, items }) => <GroupMenu key={g} label={GROUP_LABEL[g]} items={items} basePath={props.basePath} onNavigate={props.onNavigate} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SearchPill onOpen={openPalette} />
            <button type="button" onClick={openPalette} aria-label="Search" className="flex size-10 items-center justify-center rounded-full text-[var(--certa-muted)] hover:bg-[var(--certa-inset)] hover:text-[var(--certa-text)] xl:hidden">
              <Search className="size-5" aria-hidden />
            </button>
            <SyncChip sync={props.sync} onSyncNow={props.onSyncNow} />
            {canLog && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => props.onNavigate('/flights/new')}
                className="hidden h-11 items-center gap-2 rounded-full bg-[var(--certa-action)] px-5 text-[15px] font-semibold whitespace-nowrap text-[var(--certa-onAction)] shadow-[var(--certa-shadow)] transition-opacity hover:opacity-90 lg:inline-flex"
              >
                <Plus className="size-4" aria-hidden /> Log flight
              </motion.button>
            )}
            <div className="w-11">
              <UserMenu {...props} side="bottom" align="end" compact />
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {props.sync.status === 'offline' && props.sync.message && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-[var(--certa-border)] bg-[var(--certa-inset)]" role="status">
            <div className="mx-auto flex max-w-[1320px] items-center gap-2 px-4 py-2 text-[13px] sm:px-6 lg:px-8">
              <CloudOff aria-hidden className="size-4" style={{ color: 'var(--certa-pending)' }} /> {props.sync.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-32 sm:px-6 lg:px-8 lg:pt-10 lg:pb-16">
        {siblings.length > 1 && <SubNav items={siblings} basePath={props.basePath} onNavigate={props.onNavigate} />}
        <motion.div key={active?.id ?? 'page'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
          {props.children}
        </motion.div>
        <footer className="mt-16 flex items-start gap-2 border-t border-[var(--certa-border)] pt-6 text-[12px] leading-relaxed text-[var(--certa-muted)]">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <small data-testid="compliance-notice" className="text-[12px]">
            {props.complianceNotice}
          </small>
        </footer>
      </main>

      {/* Mobile field mode: Today · Flights · (+ Log) · Aircraft · More */}
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-canvas)_90%,transparent)] backdrop-blur-xl lg:hidden">
        <ul className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center px-2">
          <li>{tabs[0] && <TabLink item={tabs[0]} {...props} />}</li>
          <li>{tabs[1] && <TabLink item={tabs[1]} {...props} />}</li>
          <li className="flex justify-center">
            {canLog && (
              <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => props.onNavigate('/flights/new')} aria-label="Log a flight" className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[var(--certa-action)] text-[var(--certa-onAction)] shadow-[var(--certa-shadow-lg)]">
                <Plus className="size-6" aria-hidden />
              </motion.button>
            )}
          </li>
          <li>{tabs[2] && <TabLink item={tabs[2]} {...props} />}</li>
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn('flex w-full flex-col items-center gap-1 py-2 text-[11px] font-semibold', rest.some((n) => n.active) ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)]')}>
              <Ellipsis aria-hidden className="size-[22px]" />
              More
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={rest} basePath={props.basePath} onNavigate={props.onNavigate} org={<OrgSwitcher {...props} />} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={props.commands} results={props.search.results} onSearch={props.onSearch} onSelect={props.onNavigate} />
    </div>
  );
}

function TabLink({ item, basePath, onNavigate }: { item: NavItem } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
  const Icon = iconFor(item);
  return (
    <a
      href={basePath + item.href}
      aria-current={item.active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(item.href);
      }}
      className={cn('relative flex flex-col items-center gap-1 py-2 text-[11px] font-semibold', item.active ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)]')}
    >
      {item.active && <motion.span layoutId="nav-tab" className="absolute -top-px h-0.5 w-8 rounded-full bg-[var(--certa-text)]" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
      <Icon aria-hidden className="size-[22px]" strokeWidth={item.active ? 2.2 : 1.8} />
      {item.label}
    </a>
  );
}

function MoreSheet({ open, onClose, items, basePath, onNavigate, org }: { open: boolean; onClose: () => void; items: NavItem[]; org: ReactNode } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div className="absolute inset-0 bg-[rgb(10_10_12/0.35)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="More"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => info.offset.y > 80 && onClose()}
            className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[var(--certa-border)] bg-[var(--certa-surface)] px-4 pt-3 pb-6 shadow-[var(--certa-shadow-lg)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--certa-border)]" />
            <div className="mb-3">{org}</div>
            <ul className="space-y-1">
              {items.map((n) => (
                <li key={n.id} onClick={onClose}>
                  <NavLink item={n} basePath={basePath} onNavigate={onNavigate} layoutGroup="nav-sheet" />
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
