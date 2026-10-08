/**
 * Shared view-model building blocks. View-models are display-ready: units converted, dates
 * formatted, statuses computed. Presentational components never do logic on them.
 */
import type { ReadinessLevel, Role } from '../domain/enums.js';
import type { DateDisplay } from '../format/dates.js';
import type { Quantity } from '../format/units.js';
import type { Action } from '../domain/permissions.js';

export type { DateDisplay, Quantity, ReadinessLevel, Role, Action };

/** Contract status of a view-model: `stable` may be built against; `draft` will change. */
export type ContractStatus = 'stable' | 'draft';

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

/** Shared layout props for every authenticated screen. */
export interface AppShellViewModel {
  user: UserChip;
  organization: { id: string; name: string };
  orgOptions: OrgSwitcherOption[];
  /** Actions the current user may perform; use to hide nav items and buttons. */
  permissions: Action[];
  /** Required on every screen showing computed compliance status. */
  complianceNotice: string;
  /** Pending sync conflicts needing a human (web + mobile). */
  conflictCount: number;
  /** Mobile: last successful sync; web: null. */
  lastSyncedAt: DateDisplay | null;
  offline: boolean;
}

export interface AppShellCallbacks {
  onSwitchOrg: (orgId: string) => void;
  onSignOut: () => void;
  onNavigate: (href: string) => void;
}

export const COMPLIANCE_NOTICE =
  'Certa is a record-keeping tool. Operators remain responsible for compliance with all applicable regulations. Regulatory values shown are pending verification.';
