/**
 * Screen view-models and callback contracts. One `XxxScreenProps` per screen in
 * contract/SCREENS.md. Each interface notes its contract status:
 *   @status stable — build and polish against it; changes are versioned in contract/CHANGELOG.md
 *   @status beta   — build against it now; may gain fields (additive) when its phase starts
 *   @status draft  — shape will change when its phase starts; placeholder only
 *
 * Screens render inside <AppShell> (see AppShellProps in contract/types.ts), so they do not
 * receive shell props themselves.
 */
import type { ReadinessLevel, Role } from '../domain/enums.js';
import type {
  AppShellCallbacks,
  AsyncState,
  DateDisplay,
  EmptyState,
  Paged,
  Quantity,
  ReadinessReason,
  StatusBadge,
  UserChip,
} from './common.js';

/**
 * A user-selected file, platform-neutral. Web passes the DOM `File` as `handle`; mobile passes
 * the document-picker URI. Containers own the upload; components only forward it.
 */
export interface PickedFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  handle: unknown;
}

// =====================================================================================
// Auth (stable)
// =====================================================================================

/** @status stable — route: /sign-in (web), (auth)/sign-in (mobile) */
export interface SignInScreenProps extends AsyncState {
  initialEmail: string | null;
  magicLinkSentTo: string | null;
  /** Shown when the deployment has SSO configured (Phase 7). */
  ssoProviders: { id: string; label: string }[];
  onSubmitPassword: (input: { email: string; password: string }) => void;
  onRequestMagicLink: (input: { email: string }) => void;
  onSignInWithSso: (providerId: string) => void;
  onGoToSignUp: () => void;
}

/** @status stable — route: /sign-up */
export interface SignUpScreenProps extends AsyncState {
  /** IANA zones offered in the picker, with the browser's zone first. */
  timezoneOptions: { value: string; label: string }[];
  defaultTimezone: string;
  passwordMinLength: number;
  onSubmit: (input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
    timezone: string;
  }) => void;
  onGoToSignIn: () => void;
}

// =====================================================================================
// Administration (stable, Phase 1)
// =====================================================================================

export interface RuleRowViewModel {
  id: string;
  title: string;
  description: string;
  appliesTo: string;
  /** Effective value formatted for display in org units, e.g. "400 ft (121.9 m)". */
  valueDisplay: string;
  /** Pack value when overridden, else null. */
  packValueDisplay: string | null;
  statedAs: string | null;
  sourceCitation: string;
  sourceTitle: string;
  sourceUrl: string | null;
  lastVerified: DateDisplay | null;
  needsVerification: boolean;
  override: { reason: string; setBy: string | null; setAt: DateDisplay } | null;
  canOverride: boolean;
  /** Editor hint for overrides. */
  valueKind: 'duration' | 'length' | 'speed' | 'mass' | 'money' | 'integer' | 'boolean' | 'date' | 'text';
}

/** @status stable — route: /admin/rules */
export interface RulePackAdminScreenProps extends AsyncState {
  pack: {
    jurisdiction: string;
    name: string;
    version: string;
    authority: string;
    effectiveFrom: DateDisplay;
    disclaimer: string;
    ruleCount: number;
    unverifiedCount: number;
  } | null;
  availableJurisdictions: { jurisdiction: string; name: string; active: boolean }[];
  credentialTypes: { id: string; label: string; description: string; validity: string; requiredForCurrency: boolean }[];
  rules: RuleRowViewModel[];
  filter: { search: string; appliesTo: string | null; unverifiedOnly: boolean };
  empty: EmptyState;
  onFilterChange: (filter: { search: string; appliesTo: string | null; unverifiedOnly: boolean }) => void;
  onSetOverride: (input: { ruleId: string; value: unknown; reason: string }) => void;
  onClearOverride: (input: { ruleId: string; reason: string }) => void;
  onSelectJurisdiction: (jurisdiction: string) => void;
}

export interface MemberRowViewModel {
  membershipId: string;
  user: UserChip;
  email: string;
  role: Role;
  roleLabel: string;
  /** Auditor access window, if time-boxed. */
  expires: DateDisplay | null;
  joined: DateDisplay;
  isSelf: boolean;
}

/** @status stable — route: /admin/members */
export interface MembersAdminScreenProps extends AsyncState {
  members: MemberRowViewModel[];
  roleOptions: { value: Role; label: string; description: string }[];
  canManage: boolean;
  empty: EmptyState;
  onInvite: (input: { email: string; name: string; role: Role; expiresAt: string | null }) => void;
  onChangeRole: (input: { membershipId: string; role: Role }) => void;
  onSetExpiry: (input: { membershipId: string; expiresAt: string | null }) => void;
  onRemove: (membershipId: string) => void;
}

/** @status stable — route: /settings/organization */
export interface OrgSettingsScreenProps extends AsyncState {
  values: {
    name: string;
    timezone: string;
    units: { length: string; speed: string; mass: string; temperature: string };
    defaultJurisdiction: string;
  };
  options: {
    timezones: { value: string; label: string }[];
    length: { value: string; label: string }[];
    speed: { value: string; label: string }[];
    mass: { value: string; label: string }[];
    temperature: { value: string; label: string }[];
    jurisdictions: { value: string; label: string }[];
  };
  canEdit: boolean;
  saving: boolean;
  onSave: (values: OrgSettingsScreenProps['values']) => void;
}

export interface AuditEventViewModel {
  id: number;
  at: DateDisplay;
  actor: UserChip | null;
  /** "Direct database change" when no actor was recorded — a red flag. */
  actorLabel: string;
  entityLabel: string;
  operation: 'created' | 'updated' | 'deleted';
  changes: { field: string; before: string | null; after: string | null }[];
}

/** @status stable — route: /admin/audit */
export interface AuditLogScreenProps extends AsyncState {
  events: AuditEventViewModel[];
  hasMore: boolean;
  filter: { entity: string | null; actorUserId: string | null };
  entityOptions: { value: string; label: string }[];
  empty: EmptyState;
  onFilterChange: (filter: { entity: string | null; actorUserId: string | null }) => void;
  onLoadMore: () => void;
}

// =====================================================================================
// Core loop (beta — Phase 2)
// =====================================================================================

export interface ReadinessRowViewModel {
  id: string;
  name: string;
  /** Pilot certificate no. / aircraft registration, etc. */
  subtitle: string | null;
  status: StatusBadge;
  reasons: ReadinessReason[];
  href: string;
}

/** @status beta — route: / (web dashboard), (tabs)/index (mobile) */
export interface ReadinessDashboardScreenProps extends AsyncState {
  asOf: DateDisplay;
  overall: StatusBadge;
  counts: Record<ReadinessLevel, number>;
  pilots: ReadinessRowViewModel[];
  aircraft: ReadinessRowViewModel[];
  /** Soonest-first list of everything expiring in the alert horizon. */
  upcoming: { label: string; subject: string; due: DateDisplay; level: ReadinessLevel; href: string }[];
  empty: EmptyState;
  onAddPilot: () => void;
  onAddAircraft: () => void;
  onLogFlight: () => void;
  onOpen: (href: string) => void;
}

export interface PilotRowViewModel {
  id: string;
  name: string;
  certificateNumber: string | null;
  status: StatusBadge;
  totalFlightTime: Quantity;
  lastFlight: DateDisplay | null;
}

/** @status beta — route: /pilots */
export interface PilotListScreenProps extends AsyncState {
  pilots: PilotRowViewModel[];
  search: string;
  canManage: boolean;
  empty: EmptyState;
  onSearch: (q: string) => void;
  onAddPilot: () => void;
  onOpenPilot: (pilotId: string) => void;
}

export interface CredentialViewModel {
  id: string;
  typeLabel: string;
  identifier: string | null;
  issued: DateDisplay | null;
  expires: DateDisplay | null;
  /** "Does not expire" / "Computed from issue date per 14 CFR 107.65" etc. */
  expiryBasis: string;
  status: StatusBadge;
  documentCount: number;
}

/** @status beta — route: /pilots/[pilotId] */
export interface PilotDetailScreenProps extends AsyncState {
  pilot: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    certificateNumber: string | null;
    status: StatusBadge;
    reasons: ReadinessReason[];
    totals: { flights: number; flightTime: Quantity; last90DaysFlights: number };
  } | null;
  credentials: CredentialViewModel[];
  recentFlights: FlightRowViewModel[];
  credentialTypeOptions: { value: string; label: string; expires: boolean }[];
  canEdit: boolean;
  onEditPilot: () => void;
  onAddCredential: (input: {
    credentialType: string;
    identifier: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    file: PickedFile | null;
  }) => void;
  onEditCredential: (credentialId: string) => void;
  onExportLogbook: () => void;
  onOpenFlight: (flightId: string) => void;
}

/** @status beta — route: /pilots/new, /pilots/[pilotId]/edit */
export interface PilotFormScreenProps extends AsyncState {
  mode: 'create' | 'edit';
  values: { displayName: string; email: string; phone: string; certificateNumber: string; inviteAsUser: boolean; role: Role };
  fieldErrors: Partial<Record<'displayName' | 'email' | 'phone' | 'certificateNumber', string>>;
  saving: boolean;
  onSubmit: (values: PilotFormScreenProps['values']) => void;
  onCancel: () => void;
}

export interface AircraftRowViewModel {
  id: string;
  name: string;
  makeModel: string;
  serialNumber: string;
  registrationNumber: string | null;
  status: StatusBadge;
  totalFlightTime: Quantity;
  totalFlights: number;
}

/** @status beta — route: /aircraft */
export interface AircraftListScreenProps extends AsyncState {
  aircraft: AircraftRowViewModel[];
  search: string;
  statusFilter: 'all' | 'active' | 'grounded' | 'retired';
  canManage: boolean;
  empty: EmptyState;
  onSearch: (q: string) => void;
  onStatusFilter: (s: AircraftListScreenProps['statusFilter']) => void;
  onAddAircraft: () => void;
  onOpenAircraft: (aircraftId: string) => void;
}

/** @status beta — route: /aircraft/[aircraftId] */
export interface AircraftDetailScreenProps extends AsyncState {
  aircraft: {
    id: string;
    name: string;
    makeModel: string;
    serialNumber: string;
    registrationNumber: string | null;
    registrationExpires: DateDisplay | null;
    remoteId: string;
    takeoffMass: Quantity | null;
    firmwareVersion: string | null;
    status: StatusBadge;
    groundedReason: string | null;
    reasons: ReadinessReason[];
    totals: { flights: number; flightTime: Quantity };
  } | null;
  recentFlights: FlightRowViewModel[];
  batteries: BatteryRowViewModel[];
  canEdit: boolean;
  canGround: boolean;
  onEdit: () => void;
  onGround: (input: { reason: string }) => void;
  onUnground: (input: { reason: string }) => void;
  onExportLogbook: () => void;
  onOpenFlight: (flightId: string) => void;
}

/** @status beta — route: /aircraft/new, /aircraft/[aircraftId]/edit */
export interface AircraftFormScreenProps extends AsyncState {
  mode: 'create' | 'edit';
  values: {
    nickname: string;
    make: string;
    model: string;
    serialNumber: string;
    registrationNumber: string;
    registrationExpiresOn: string;
    remoteIdMethod: string;
    remoteIdSerial: string;
    takeoffMass: string;
    firmwareVersion: string;
  };
  massUnitLabel: string;
  remoteIdOptions: { value: string; label: string }[];
  fieldErrors: Partial<Record<keyof AircraftFormScreenProps['values'], string>>;
  saving: boolean;
  onSubmit: (values: AircraftFormScreenProps['values']) => void;
  onCancel: () => void;
}

export interface BatteryRowViewModel {
  id: string;
  label: string;
  serialNumber: string;
  cycleCount: number;
  cycleLimit: number | null;
  status: StatusBadge;
  lastUsed: DateDisplay | null;
}

/** @status beta — route: /batteries */
export interface BatteryListScreenProps extends AsyncState {
  batteries: BatteryRowViewModel[];
  canManage: boolean;
  empty: EmptyState;
  onAddBattery: () => void;
  onOpenBattery: (batteryId: string) => void;
}

export interface FlightRowViewModel {
  id: string;
  /** In the flight location's local time. */
  takeoff: DateDisplay;
  duration: Quantity;
  pilotName: string;
  aircraftName: string;
  locationName: string | null;
  maxAltitude: Quantity | null;
  source: 'manual' | 'import';
  /** True while the record exists only on this device. */
  pendingSync: boolean;
}

/** @status beta — route: /flights */
export interface FlightListScreenProps extends AsyncState {
  flights: Paged<FlightRowViewModel>;
  filter: { pilotId: string | null; aircraftId: string | null; from: string | null; to: string | null };
  pilotOptions: { value: string; label: string }[];
  aircraftOptions: { value: string; label: string }[];
  totals: { flights: number; flightTime: Quantity };
  canLog: boolean;
  empty: EmptyState;
  onFilterChange: (filter: FlightListScreenProps['filter']) => void;
  onLoadMore: () => void;
  onLogFlight: () => void;
  onImport: () => void;
  onOpenFlight: (flightId: string) => void;
}

/** @status beta — route: /flights/[flightId] */
export interface FlightDetailScreenProps extends AsyncState {
  flight: {
    id: string;
    takeoff: DateDisplay;
    landing: DateDisplay;
    duration: Quantity;
    pilot: UserChip;
    observers: UserChip[];
    aircraft: { id: string; name: string };
    batteries: { id: string; label: string; startPct: number | null; endPct: number | null }[];
    locationName: string | null;
    maxAltitude: Quantity | null;
    maxDistance: Quantity | null;
    operationType: string;
    airspaceClass: string | null;
    authorizationRef: string | null;
    weatherSummary: string | null;
    notes: string | null;
    source: string;
    integrity: { contentHash: string; verified: boolean | null } | null;
  } | null;
  /** GeoJSON LineString for the map; null when no path. */
  path: unknown | null;
  altitudeProfile: { t: number; altitude: number }[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * @status beta — route: /flights/new (web), (tabs)/log (mobile)
 * Designed for < 30 s entry on mobile: everything defaults from the last flight.
 */
export interface LogFlightScreenProps extends AsyncState {
  defaults: {
    pilotId: string;
    aircraftId: string | null;
    batteryIds: string[];
    siteId: string | null;
    operationType: string;
    takeoffAt: string;
    durationMinutes: number | null;
  };
  hasLastFlight: boolean;
  pilotOptions: { value: string; label: string; status: StatusBadge }[];
  aircraftOptions: { value: string; label: string; status: StatusBadge; recent: boolean }[];
  batteryOptions: { value: string; label: string; status: StatusBadge }[];
  siteOptions: { value: string; label: string; recent: boolean }[];
  operationTypeOptions: { value: string; label: string }[];
  /** Pre-flight warnings, e.g. "Recurrent training expired". Never blocks logging. */
  warnings: ReadinessReason[];
  altitudeUnitLabel: string;
  fieldErrors: Record<string, string>;
  saving: boolean;
  onSameAsLast: () => void;
  onSubmit: (input: {
    pilotId: string;
    aircraftId: string;
    batteryIds: string[];
    siteId: string | null;
    operationType: string;
    takeoffAt: string;
    landingAt: string;
    maxAltitude: number | null;
    locationName: string | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}

export interface SyncConflictViewModel {
  id: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  localValue: string;
  serverValue: string;
  localChangedBy: string;
  serverChangedBy: string;
  localAt: DateDisplay;
  serverAt: DateDisplay;
}

/** @status beta — route: /sync/conflicts */
export interface SyncConflictsScreenProps extends AsyncState {
  conflicts: SyncConflictViewModel[];
  empty: EmptyState;
  onResolve: (input: { conflictId: string; choose: 'local' | 'server'; note: string | null }) => void;
}

// =====================================================================================
// Later phases (draft placeholders — stabilized at the start of each phase)
// =====================================================================================

/** @status draft — Phase 3 — route: /flights/import */
export interface ImportScreenProps extends AsyncState {
  stage: 'select' | 'parsing' | 'review' | 'committing' | 'done';
  files: { name: string; parser: string | null; status: 'pending' | 'parsed' | 'error'; warnings: string[] }[];
  candidates: {
    key: string;
    takeoff: DateDisplay;
    duration: Quantity;
    aircraftLabel: string;
    duplicateOf: string | null;
    confidence: number;
    include: boolean;
  }[];
  onSelectFiles: (files: PickedFile[]) => void;
  onToggleCandidate: (key: string, include: boolean) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/** @status draft — Phase 4 — route: /maintenance */
export interface MaintenanceScreenProps extends AsyncState {
  due: { id: string; target: string; name: string; due: DateDisplay | null; usage: string | null; status: StatusBadge }[];
  history: { id: string; target: string; performed: DateDisplay; description: string; signedOff: boolean }[];
  onLogMaintenance: (scheduleId: string | null) => void;
  onOpenTarget: (href: string) => void;
}

/** @status draft — Phase 4 — route: /checklists */
export interface ChecklistsScreenProps extends AsyncState {
  templates: { id: string; name: string; kind: string; version: number; isDefault: boolean }[];
  onCreateTemplate: () => void;
  onEditTemplate: (id: string) => void;
  onStartRun: (templateId: string) => void;
}

/** @status draft — Phase 4 — route: /incidents */
export interface IncidentsScreenProps extends AsyncState {
  incidents: {
    id: string;
    occurred: DateDisplay;
    summary: string;
    severity: string;
    status: string;
    reportability: { label: string; deadline: DateDisplay | null; advisory: string };
  }[];
  onReportIncident: () => void;
  onOpenIncident: (id: string) => void;
}

/** @status draft — Phase 5 — route: /records */
export interface RecordsScreenProps extends AsyncState {
  integrity: { lastVerified: DateDisplay | null; result: 'ok' | 'failed' | 'never'; issues: string[] };
  exports: { id: string; kind: string; requested: DateDisplay; status: string; downloadHref: string | null }[];
  onVerifyIntegrity: () => void;
  onExport: (input: { kind: 'pilot_logbook' | 'aircraft_logbook' | 'compliance_packet' | 'csv' | 'json'; subjectId: string | null; from: string | null; to: string | null }) => void;
}

/** @status draft — Phase 6 — route: /missions */
export interface MissionsScreenProps extends AsyncState {
  missions: { id: string; name: string; client: string | null; planned: DateDisplay | null; status: string; readiness: StatusBadge }[];
  onPlanMission: () => void;
  onOpenMission: (id: string) => void;
}

/** @status draft — Phase 6 — route: /analytics */
export interface AnalyticsScreenProps extends AsyncState {
  range: { from: string; to: string };
  hoursByMonth: { month: string; hours: number }[];
  hoursByPilot: { label: string; hours: number }[];
  hoursByAircraft: { label: string; hours: number }[];
  incidentRate: { month: string; per100Hours: number }[];
  onRangeChange: (range: { from: string; to: string }) => void;
}

/** @status draft — Phase 7 — route: /assistant (only when the AI module is enabled) */
export interface AssistantScreenProps extends AsyncState {
  messages: { id: string; role: 'user' | 'assistant'; text: string; citations: { label: string; href: string }[] }[];
  onAsk: (question: string) => void;
}

export type { AppShellCallbacks };
