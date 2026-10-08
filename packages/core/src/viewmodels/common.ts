/**
 * Shared view-model building blocks. View-models are display-ready: units converted, dates
 * formatted, statuses computed. Presentational components never do logic on them.
 */
import type { ReadinessLevel, Role } from '../domain/enums.js';
import type { DateDisplay } from '../format/dates.js';
import type { Quantity } from '../format/units.js';
import type { Action } from '../domain/permissions.js';

export type { DateDisplay, Quantity, ReadinessLevel, Role, Action };

/** Contract status of a view-model: `stable` and `beta` may be built against; `draft` will change. */
export type ContractStatus = 'stable' | 'beta' | 'draft';

export interface StatusBadge {
  level: ReadinessLevel;
  /** Short text, e.g. "Current", "Expires in 12 days", "Grounded". */
  label: string;
}

export interface ReadinessReason {
  level: ReadinessLevel;
  /** e.g. "Recurrent training expires". */
  text: string;
  /** Present for date-based items. */
  due: DateDisplay | null;
  /** Where to fix it, e.g. "/pilots/…/credentials". */
  href: string | null;
}

export interface UserChip {
  id: string;
  name: string;
  initials: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  /** Opaque cursor for the next page; null when there is no more. */
  nextCursor: string | null;
}

/** Every screen receives these async states via props — components never fetch. */
export interface AsyncState {
  loading: boolean;
  /** Human-readable error message, or null. */
  error: string | null;
}

/** Empty-state copy is supplied as data so the frontend never invents product wording. */
export interface EmptyState {
  title: string;
  body: string;
  /** Label of the primary action button (wired to the screen's primary callback). */
  actionLabel: string | null;
}

export interface OrgSwitcherOption {
  orgId: string;
  name: string;
  role: Role;
  current: boolean;
}

export type ThemeName = 'light' | 'dark' | 'sunlight';

/** Icon keys the shell may render; the frontend maps each key to an icon. */
export type NavIcon =
  | 'today'
  | 'flights'
  | 'pilots'
  | 'aircraft'
  | 'batteries'
  | 'maintenance'
  | 'missions'
  | 'incidents'
  | 'records'
  | 'analytics'
  | 'settings'
  | 'admin';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: NavIcon;
  active: boolean;
  /** e.g. count of red items; null hides the badge. */
  badge: { text: string; level: ReadinessLevel } | null;
}

/**
 * Sync status for the shell.
 * - web: always `online`, pendingChanges 0, lastSynced null.
 * - mobile: reflects the offline-first sync engine.
 */
export interface SyncStateViewModel {
  status: 'online' | 'syncing' | 'offline' | 'error';
  /** Local changes not yet accepted by the server. */
  pendingChanges: number;
  lastSynced: DateDisplay | null;
  /** Human-readable, e.g. "Offline — 3 changes will sync when you reconnect". */
  message: string | null;
  /** Conflicts needing a human; links to the sync conflicts screen. */
  conflictCount: number;
}

/** Shared layout props for every authenticated screen. Built by the host, never by components. */
export interface AppShellViewModel {
  user: UserChip & { email: string; roleLabel: string };
  organization: { id: string; name: string };
  orgOptions: OrgSwitcherOption[];
  /** Already filtered by permission and ordered. */
  navigation: NavItem[];
  /** Actions the current user may perform; use to hide buttons inside screens. */
  permissions: Action[];
  /** Required on every screen showing computed compliance status. */
  complianceNotice: string;
  sync: SyncStateViewModel;
  /** Current theme; persistence belongs to the host. */
  theme: ThemeName;
}

export interface AppShellCallbacks {
  onSwitchOrg: (orgId: string) => void;
  onSignOut: () => void;
  onNavigate: (href: string) => void;
  onThemeChange: (theme: ThemeName) => void;
  /** Mobile: user pulled to refresh or tapped "Sync now". */
  onSyncNow: () => void;
}

export const COMPLIANCE_NOTICE =
  'Certa is a record-keeping tool. Operators remain responsible for compliance with all applicable regulations. Regulatory values shown are pending verification.';
