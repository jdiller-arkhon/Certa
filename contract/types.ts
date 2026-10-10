/**
 * Certa frontend contract — the single source of truth for presentational components.
 *
 * Contract version: see CHANGELOG.md. Every type here is re-exported from @certa/core so the
 * API, the containers, and the components can never disagree.
 *
 * Rules for components (see SCREENS.md):
 * - Receive data only through these props; report actions only through the callback props.
 * - Never fetch, never compute readiness/expiry/currency, never convert units or format dates.
 */
export type {
  // shared building blocks
  ContractStatus,
  DateDisplay,
  Quantity,
  ReadinessLevel,
  Airframe,
  Role,
  Action,
  StatusBadge,
  ReadinessReason,
  UserChip,
  Paged,
  AsyncState,
  EmptyState,
  OrgSwitcherOption,
  ThemeName,
  NavIcon,
  NavItem,
  SyncStateViewModel,
  AppShellViewModel,
  AppShellCallbacks,
  PickedFile,
  // auth
  SignInScreenProps,
  SignUpScreenProps,
  // administration
  RuleRowViewModel,
  RulePackAdminScreenProps,
  MemberRowViewModel,
  MembersAdminScreenProps,
  OrgSettingsScreenProps,
  AuditEventViewModel,
  AuditLogScreenProps,
  // core loop
  ReadinessRowViewModel,
  ReadinessDashboardScreenProps,
  PilotRowViewModel,
  PilotListScreenProps,
  CredentialViewModel,
  PilotDetailScreenProps,
  PilotFormScreenProps,
  AircraftRowViewModel,
  AircraftListScreenProps,
  AircraftDetailScreenProps,
  AircraftFormScreenProps,
  BatteryRowViewModel,
  BatteryListScreenProps,
  FlightRowViewModel,
  FlightListScreenProps,
  FlightDetailScreenProps,
  LogFlightScreenProps,
  SyncConflictViewModel,
  SyncConflictsScreenProps,
  // later phases (draft)
  ImportScreenProps,
  MaintenanceScreenProps,
  ChecklistsScreenProps,
  IncidentsScreenProps,
  RecordsScreenProps,
  MissionsScreenProps,
  AnalyticsScreenProps,
  AssistantScreenProps,
} from '@certa/core';

export { COMPLIANCE_NOTICE } from '@certa/core';

import type { AppShellCallbacks, AppShellViewModel } from '@certa/core';

/** The layout every authenticated screen renders inside. `children` is the screen. */
export type AppShellProps = AppShellViewModel & AppShellCallbacks;

/** Keys of `P` whose values are callbacks. */
export type CallbackKeys<P> = { [K in keyof P]-?: P[K] extends (...args: never[]) => unknown ? K : never }[keyof P];

/** The data half of a screen's props — what fixtures provide and containers compute. */
export type ScreenData<P> = Omit<P, CallbackKeys<P>>;

/** The callback half of a screen's props — what containers wire to mutations/navigation. */
export type ScreenCallbacks<P> = Pick<P, CallbackKeys<P>>;
