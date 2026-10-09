'use client';

import type { AppShellProps, NavItem, ThemeName } from '@certa/contract';
import {
  BatteryMedium,
  BookOpenCheck,
  Briefcase,
  Check,
  ChartLine,
  ChevronsUpDown,
  Cloud,
  CloudOff,
  Ellipsis,
  History,
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
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/components/cn';
import { CertaMark } from '@/components/hub';
import { EASE } from '@/components/motion';
import { MenuItem, Popover } from '@/components/popover';
import { Avatar } from '@/components/ui/avatar';
import { Segmented } from '@/components/ui/segmented';
import { LEVEL_COLOR } from '@/components/ui/status';

const BY_ID: Record<string, LucideIcon> = { rules: BookOpenCheck, members: UserCog, audit: History };
const BY_ICON: Record<NavItem['icon'], LucideIcon> = {
  today: Radar,
  flights: Route,
  pilots: Users,
  aircraft: Plane,
  batteries: BatteryMedium,
  maintenance: Wrench,
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
  return (
    <div className="flex items-center gap-2.5">
      <CertaMark className="size-8 text-[var(--certa-text)]" />
      <div className="leading-none">
        <div className="text-[17px] font-bold tracking-[0.2em]">CERTA</div>
        {!compact && <div className="mt-1 text-[8.5px] font-semibold tracking-[0.22em] text-[var(--certa-muted)]">BY ARKHON INDUSTRIES</div>}
      </div>
    </div>
  );
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
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--certa-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--certa-muted)] transition-colors hover:text-[var(--certa-text)]"
    >
      <Icon aria-hidden className={cn('size-3.5', syncing && 'animate-spin')} style={{ color }} />
      {label}
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
            'flex w-full items-center gap-3 rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 py-2.5 text-left transition-colors',
            multiple && 'hover:bg-[var(--certa-inset)]',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--certa-action)] text-[13px] font-bold text-[var(--certa-onAction)]">
            {props.organization.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span data-testid="org-name" className="block truncate text-sm font-semibold">
              {props.organization.name}
            </span>
            <span className="block truncate text-[12px] text-[var(--certa-muted)]">{props.user.roleLabel}</span>
          </span>
          {multiple && <ChevronsUpDown aria-hidden className="size-4 text-[var(--certa-muted)]" />}
        </button>
      )}
      className="w-full"
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
          aria-haspopup="menu"
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

const TAB_IDS = ['today', 'flights', 'pilots'];
const ThemeIcon = { light: Sun, dark: Moon, sunlight: SunMedium };

export function AppShell(props: AppShellProps & { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const active = props.navigation.find((n) => n.active);
  const tabs = props.navigation.filter((n) => TAB_IDS.includes(n.id));
  const rest = props.navigation.filter((n) => !TAB_IDS.includes(n.id));
  const NextTheme = ThemeIcon[props.theme];
  const cycleTheme = () => props.onThemeChange(props.theme === 'light' ? 'dark' : props.theme === 'dark' ? 'sunlight' : 'light');

  return (
    <div className="certa min-h-dvh" data-testid="app-shell">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-[var(--certa-border)] bg-[var(--certa-canvas)] lg:flex">
        <div className="px-6 pt-6 pb-5">
          <Wordmark />
        </div>
        <div className="px-4">
          <OrgSwitcher {...props} />
        </div>
        <nav aria-label="Main" className="mt-5 flex-1 overflow-y-auto px-4">
          <ul className="space-y-0.5">
            {props.navigation.map((n) => (
              <li key={n.id}>
                <NavLink item={n} basePath={props.basePath} onNavigate={props.onNavigate} layoutGroup="nav-desktop" />
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 border-t border-[var(--certa-border)] p-4">
          <div className="flex items-center justify-between px-2">
            <SyncChip sync={props.sync} onSyncNow={props.onSyncNow} />
            <button type="button" onClick={cycleTheme} aria-label={`Theme: ${props.theme}. Switch theme`} className="rounded-full p-1.5 text-[var(--certa-muted)] transition-colors hover:bg-[var(--certa-inset)] hover:text-[var(--certa-text)]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={props.theme} className="block" initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.6 }} transition={{ duration: 0.3, ease: EASE }}>
                  <NextTheme className="size-4" aria-hidden />
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
          <UserMenu {...props} />
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header className="safe-top sticky top-0 z-30 border-b border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-canvas)_85%,transparent)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Wordmark compact />
          <div className="flex items-center gap-2">
            <SyncChip sync={props.sync} onSyncNow={props.onSyncNow} />
            <div className="w-11">
              <UserMenu {...props} side="bottom" align="end" compact />
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- Content ---------------- */}
      <div className="lg:pl-[272px]">
        <AnimatePresence>
          {props.sync.status === 'offline' && props.sync.message && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[var(--certa-border)] bg-[var(--certa-inset)]"
              role="status"
            >
              <div className="flex items-center gap-2 px-6 py-2 text-[13px] text-[var(--certa-text)]">
                <CloudOff aria-hidden className="size-4" style={{ color: 'var(--certa-pending)' }} /> {props.sync.message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-32 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16">
          <motion.div key={active?.id ?? 'page'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            {props.children}
          </motion.div>
          <footer className="mt-16 flex items-start gap-2 border-t border-[var(--certa-border)] pt-6 text-[12px] leading-relaxed text-[var(--certa-muted)]">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <small data-testid="compliance-notice" className="text-[12px]">
              {props.complianceNotice}
            </small>
          </footer>
        </main>
      </div>

      {/* ---------------- Mobile bottom tabs: Today · Flights · (+) · Pilots · More ---------------- */}
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-canvas)_88%,transparent)] backdrop-blur-xl lg:hidden">
        <ul className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center px-2">
          <li>{tabs[0] && <TabLink item={tabs[0]} {...props} />}</li>
          <li>{tabs[1] && <TabLink item={tabs[1]} {...props} />}</li>
          <li className="flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => props.onNavigate('/flights/new')}
              aria-label="Log a flight"
              className="-mt-7 flex size-14 items-center justify-center rounded-full bg-[var(--certa-action)] text-[var(--certa-onAction)] shadow-[var(--certa-shadow-lg)]"
            >
              <Plus className="size-6" aria-hidden />
            </motion.button>
          </li>
          <li>{tabs[2] && <TabLink item={tabs[2]} {...props} />}</li>
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn('flex w-full flex-col items-center gap-1 py-2 text-[11px] font-semibold', rest.some((n) => n.active) ? 'text-[var(--certa-text)]' : 'text-[var(--certa-muted)]')}
            >
              <Ellipsis aria-hidden className="size-[22px]" />
              More
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={rest} basePath={props.basePath} onNavigate={props.onNavigate} />
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

function MoreSheet({ open, onClose, items, basePath, onNavigate }: { open: boolean; onClose: () => void; items: NavItem[] } & Pick<AppShellProps, 'basePath' | 'onNavigate'>) {
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
