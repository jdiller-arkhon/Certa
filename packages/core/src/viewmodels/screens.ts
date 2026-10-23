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
import type { Airframe, ReadinessLevel, Role } from '../domain/enums.js';
import type { GoNoGoResult } from '../fleet/fleet.js';
import type { GettingStartedViewModel } from './help.js';
import type { InspectorPacket } from '../fleet/packet.js';
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
 * A user-selected file. The host passes the DOM `File` as `handle`. Containers own the upload; components only forward it.
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

/** @status stable — route: /sign-in */
export interface SignInScreenProps extends AsyncState {
  initialEmail: string | null;
  magicLinkSentTo: string | null;
  /** Shown when the deployment has SSO configured (Phase 7). */
  ssoProviders: { id: string; label: string }[];
  /**
   * Certa's own password and email-link sign-in. False when everyone signs in through an SSO
   * provider (Arkhon): the screen then offers only the providers, and "create an account" goes
   * to the provider's sign-up.
   */
  localAuth: boolean;
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
  /**
   * How to edit an override, already in the org's display units. The override editor shows
   * `editor.value` with `editor.unit` and returns the edited value in the SAME units via
   * `onSetOverride`; the host converts to SI.
   */
  editor: RuleEditor;
}

export type RuleEditor =
  | { input: 'number'; unit: string | null; value: number; step: number }
  | { input: 'duration'; unit: null; value: { amount: number; unit: 'days' | 'months' | 'years'; roundTo: 'none' | 'end_of_month' } }
  | { input: 'boolean'; unit: null; value: boolean }
  | { input: 'date'; unit: null; value: string }
  | { input: 'text'; unit: null; value: string };

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
  /** `value` is in the row's `editor` units (see RuleEditor); the host converts to SI. */
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
  /** Push notifications on this device (per user, per browser). */
  notifications: {
    /** 'unsupported' = browser can't; 'unconfigured' = server has no VAPID keys; 'blocked' = permission denied. */
    availability: 'available' | 'unsupported' | 'unconfigured' | 'blocked';
    enabled: boolean;
    busy: boolean;
    message: string | null;
  };
  onSave: (values: OrgSettingsScreenProps['values']) => void;
  onToggleNotifications: (enabled: boolean) => void;
  onTestNotification: () => void;
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
  /** Aircraft rows only: airframe shape for drawing the aircraft. Absent on pilot rows. */
  airframe?: Airframe;
  /** Aircraft rows only: app-relative URL of the customer's own 3D model (GLB), when uploaded. */
  modelUrl?: string;
}

/**
 * One fix-it item on Today: something not current or coming due, with the quickest fix.
 * `fix` drives an inline form; `open` kinds just navigate to `href`.
 */
export type ActionFix =
  | { kind: 'renew_credential'; pilotId: string; credentialType: string; typeLabel: string; expires: boolean }
  | { kind: 'add_credential'; pilotId: string; credentialType: string; typeLabel: string; expires: boolean }
  | { kind: 'renew_registration'; aircraftId: string; registrationNumber: string | null }
  | { kind: 'set_remote_id'; aircraftId: string }
  | { kind: 'log_maintenance'; scheduleId: string; target: string; scheduleName: string }
  | { kind: 'renew_insurance'; policyId: string; carrier: string; expiresOn: string }
  | { kind: 'return_to_service'; aircraftId: string }
  | { kind: 'open' };

export interface ActionQueueItem {
  /** Readiness item key, stable across refreshes. */
  id: string;
  level: ReadinessLevel;
  subject: string;
  subjectKind: 'pilot' | 'aircraft';
  /** What's wrong, e.g. "Recurrent training expired". */
  problem: string;
  due: DateDisplay | null;
  href: string;
  /** Button label, e.g. "Renew", "Log work". */
  actionLabel: string;
  fix: ActionFix;
}

/** The input an inline fix submits; the host turns it into API calls. */
export interface ActionFixInput {
  itemId: string;
  fix: ActionFix;
  /** Dates are YYYY-MM-DD. Only the fields the fix needs are set. */
  values: {
    issuedOn?: string;
    expiresOn?: string;
    identifier?: string;
    registrationNumber?: string;
    remoteIdMethod?: string;
    remoteIdSerial?: string;
    performedOn?: string;
    performedBy?: string;
    reason?: string;
  };
}

/** @status beta — route: / */
export interface ReadinessDashboardScreenProps extends AsyncState {
  asOf: DateDisplay;
  overall: StatusBadge;
  counts: Record<ReadinessLevel, number>;
  pilots: ReadinessRowViewModel[];
  aircraft: ReadinessRowViewModel[];
  /** Soonest-first list of everything expiring in the alert horizon. */
  upcoming: { label: string; subject: string; due: DateDisplay; level: ReadinessLevel; href: string }[];
  /** Red first, then amber by due date. Empty when everything is current. */
  actions: ActionQueueItem[];
  /** Ids of fixes in flight (show progress on the row). */
  fixing: string[];
  /** Flights logged in the last 7 / 30 days and the last flight. */
  activity: { last7: number; last30: number; lastFlight: { label: string; when: DateDisplay; href: string } | null };
  canFix: boolean;
  empty: EmptyState;
  /** First-run checklist for the signed-in pilot; null once done, dismissed, or for non-pilots. */
  gettingStarted: GettingStartedViewModel | null;
  onAddPilot: () => void;
  onAddAircraft: () => void;
  onLogFlight: () => void;
  onOpen: (href: string) => void;
  onFix: (input: ActionFixInput) => void;
  onDismissGettingStarted: () => void;
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
  /** Bulk: download the selected pilots' credentials as CSV. */
  onExport: (pilotIds: string[]) => void;
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

/** Time-boxed, read-only inspector packet links for one pilot or aircraft. */
export interface SharePacketViewModel {
  canShare: boolean;
  links: { id: string; label: string; expires: DateDisplay; viewCount: number; status: StatusBadge; active: boolean }[];
  /** The secret URL, available only right after creating a link. */
  createdUrl: string | null;
  creating: boolean;
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
    /** All-time totals: flights logged in Certa (Argus mission flights included) plus prior experience from other apps. */
    totals: { flights: number; missions: number; flightTime: Quantity; last90DaysFlights: number };
    /** Logged in Certa, including Argus mission flights still waiting for the drone. */
    logged: { flights: number; missions: number; flightTime: Quantity };
    /** Sum of the prior-experience entries; null when there are none. */
    prior: { flights: number; missions: number; flightTime: Quantity } | null;
    /** Argus mission flights still waiting for the drone (part of `logged`); null when none. */
    argus: { flights: number; flightTime: Quantity } | null;
  } | null;
  credentials: CredentialViewModel[];
  /** Totals carried over from other apps, newest first. */
  priorExperience: PriorExperienceViewModel[];
  /** Flights from Argus missions the pilot hasn't picked the drone for yet, newest first. */
  argusFlights: ArgusFlightViewModel[];
  /** Drones that can be picked for an Argus flight. */
  aircraftOptions: { value: string; label: string }[];
  /** Whether the viewer may pick the drone for (or dismiss) this pilot's Argus flights. */
  canConvertArgus: boolean;
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
  /** Opens the edit form (the screen owns the dialog). */
  onEditCredential: (credentialId: string) => void;
  onUpdateCredential: (input: { credentialId: string; identifier: string | null; issuedOn: string | null; expiresOn: string | null }) => void;
  onRemoveCredential: (credentialId: string) => void;
  onAddPriorExperience: (input: PriorExperienceInput) => void;
  onUpdatePriorExperience: (input: PriorExperienceInput & { priorId: string }) => void;
  onRemovePriorExperience: (priorId: string) => void;
  onConvertArgusFlight: (input: { externalFlightId: string; aircraftId: string }) => void;
  onDismissArgusFlight: (externalFlightId: string) => void;
  onExportLogbook: () => void;
  onOpenFlight: (flightId: string) => void;
  share: SharePacketViewModel;
  onCreateShareLink: (input: { expiresInDays: number }) => void;
  onRevokeShareLink: (linkId: string) => void;
}

/** A flight from an Argus mission (sent when the pilot marked the job landed). */
export interface ArgusFlightViewModel {
  id: string;
  /** e.g. "Argus job #1042". */
  reference: string;
  date: DateDisplay;
  flightTime: Quantity;
  location: string | null;
}

/** Flights, missions and flight time a pilot logged in another app, entered as totals. */
export interface PriorExperienceViewModel {
  id: string;
  /** App the numbers came from, e.g. "DJI Fly". */
  source: string;
  flights: number;
  missions: number;
  flightTime: Quantity;
  flightSeconds: number;
  asOf: DateDisplay;
  notes: string | null;
}

export interface PriorExperienceInput {
  source: string;
  flights: number;
  missions: number;
  flightSeconds: number;
  /** YYYY-MM-DD, not in the future. */
  asOf: string;
  notes: string | null;
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
  /** Policies the selected aircraft can be added to (bulk action). */
  insuranceOptions: { value: string; label: string }[];
  onAddToPolicy: (input: { policyId: string; aircraftIds: string[] }) => void;
  onExport: (aircraftIds: string[]) => void;
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
  /** The hangar 3D model: the customer's own GLB, or drawn from the airframe type. */
  model: { custom: boolean; uploading: boolean; error: string | null; airframe: Airframe; url: string | null };
  onUploadModel: (file: PickedFile) => void;
  onRemoveModel: () => void;
  /** Schedules and work history for this aircraft only (worst-first, newest-first). */
  maintenance: { due: MaintenanceDueRowViewModel[]; history: MaintenanceHistoryRowViewModel[]; canManage: boolean; saving: boolean };
  /** Records work on this aircraft; `scheduleId` null for unscheduled work. */
  onLogMaintenance: (input: { scheduleId: string | null; performedOn: string; performedBy: string; description: string }) => void;
  onEdit: () => void;
  onGround: (input: { reason: string }) => void;
  onUnground: (input: { reason: string }) => void;
  onExportLogbook: () => void;
  onOpenFlight: (flightId: string) => void;
  share: SharePacketViewModel;
  onCreateShareLink: (input: { expiresInDays: number }) => void;
  onRevokeShareLink: (linkId: string) => void;
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
  /** Aircraft models in the fleet, for "fits" on the add-battery form. */
  aircraftModelOptions: { value: string; label: string }[];
  saving: boolean;
  fieldErrors: Record<string, string>;
  /** Opens the add-battery form (the screen owns the dialog). */
  onAddBattery: () => void;
  onCreateBattery: (input: {
    serialNumber: string;
    label: string | null;
    aircraftModel: string | null;
    cellCount: number | null;
    ratedCapacityMah: number | null;
    maxCycles: number | null;
  }) => void;
  onRetireBattery: (batteryId: string) => void;
  onRetireMany: (batteryIds: string[]) => void;
  onOpenBattery: (batteryId: string) => void;
  onExport: (batteryIds: string[]) => void;
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
  /** Bulk: download the selected flights as a CSV logbook. */
  onExport: (flightIds: string[]) => void;
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
  /** Pre-flight go / no-go recorded when the flight was logged; null for imports and older records. */
  preflight: GoNoGoResult | null;
  /** The pre-flight checklist signed with the flight; null when none was recorded. */
  checklist: FlightChecklistViewModel | null;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * @status beta — route: /flights/new
 * Designed for < 30 s entry on a phone (installed app, often offline): everything defaults from the last flight.
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
    /** Prefilled when editing an existing flight; null for a new one. Altitude is in `altitudeUnitLabel`. */
    locationName: string | null;
    maxAltitude: number | null;
    notes: string | null;
    /** Preselected authorization, e.g. from the mission the flight is logged for. */
    authorizationId: string | null;
  };
  hasLastFlight: boolean;
  pilotOptions: { value: string; label: string; status: StatusBadge }[];
  aircraftOptions: { value: string; label: string; status: StatusBadge; recent: boolean; model: string }[];
  /** `aircraftModel` null = fits any aircraft. */
  batteryOptions: { value: string; label: string; status: StatusBadge; aircraftModel: string | null }[];
  siteOptions: { value: string; label: string; recent: boolean }[];
  operationTypeOptions: { value: string; label: string }[];
  /** Pre-flight warnings, e.g. "Recurrent training expired". Never blocks logging. */
  warnings: ReadinessReason[];
  altitudeUnitLabel: string;
  /**
   * Pre-flight go / no-go for the current selection, computed by the host from records on file
   * (it recomputes when `onSelectionChange` fires). Advisory: never blocks logging. Stored with the flight.
   */
  preflight: GoNoGoResult | null;
  /** Authorizations valid now, for the pilot to attach (LAANC approval, waiver, COA). */
  authorizationOptions: { value: string; label: string }[];
  /** The mission this flight is being logged for, when started from one. */
  mission: { id: string; name: string } | null;
  /** The org's default pre-flight checklist to tick before logging; null when editing or none is set. */
  checklist: ChecklistViewModel | null;
  /**
   * Airspace / weather / daylight advisories at the pilot's location, on request. Advisory only.
   * When ready, the host stores the point, weather, and airspace class with the flight.
   */
  conditions: {
    status: 'idle' | 'locating' | 'loading' | 'ready' | 'error';
    /** Worst first. `href` points to where the pilot can act (LAANC, DroneZone, the TFR list). */
    advisories: { level: ReadinessLevel; title: string; detail: string; source: string; href?: string | null }[];
    /** e.g. "Clear, 14°C, wind 8 mph from 150°". */
    weatherSummary: string | null;
    checkedAt: DateDisplay | null;
    error: string | null;
  };
  fieldErrors: Record<string, string>;
  saving: boolean;
  onCheckConditions: () => void;
  onSelectionChange: (selection: { pilotId: string; aircraftId: string | null; batteryIds: string[] }) => void;
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
    /** The authorization (LAANC, waiver…) the flight operates under, if any. */
    authorizationId: string | null;
    /** Ticked items; an incomplete checklist is stored as incomplete, never blocks logging. */
    checklist: { templateId: string; templateVersion: number; responses: { itemId: string; checked: boolean }[] } | null;
  }) => void;
  onCancel: () => void;  /** Opens another screen (fixing a warning, adding the first aircraft); the form's input is discarded. */
  onOpen?: (href: string) => void;
}

export interface ChecklistViewModel {
  templateId: string;
  templateVersion: number;
  name: string;
  sections: { id: string; title: string; items: { id: string; text: string; required: boolean }[] }[];
}

/** A checklist as recorded with a flight. */
export interface FlightChecklistViewModel {
  name: string;
  version: number;
  completed: boolean;
  signed: DateDisplay | null;
  /** e.g. "12 of 13 items · 1 required item not ticked". */
  summary: string;
  sections: { title: string; items: { id: string; text: string; required: boolean; checked: boolean; note: string | null }[] }[];
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

export interface ApiKeyRowViewModel {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsed: DateDisplay | null;
  expires: DateDisplay | null;
  created: DateDisplay;
}

/** @status beta — route: /admin/integrations */
export interface IntegrationsScreenProps extends AsyncState {
  keys: ApiKeyRowViewModel[];
  /** The full key, only right after creating it. */
  createdKey: string | null;
  creating: boolean;
  canManage: boolean;
  /** API base URL for the example request, e.g. https://arkhonindustries.com/certa/api/v1 */
  apiBaseUrl: string;
  onCreateKey: (input: { name: string; expiresInDays: number | null }) => void;
  onRevokeKey: (keyId: string) => void;
  onDismissKey: () => void;
}

/**
 * @status beta — route: /share/[token] (public, no account, no shell)
 * Read-only inspector packet behind a time-boxed link. Dates in `packet` are ISO dates (YYYY-MM-DD),
 * shown as-is: inspectors compare them against documents.
 */
export interface SharedPacketScreenProps extends AsyncState {
  data: { label: string; seal: string; packet: InspectorPacket; expires: string } | null;
  pdfHref: string;
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

export interface MaintenanceDueRowViewModel {
  /** Schedule id. */
  id: string;
  target: string;
  /** Matches a `targetOptions` value. */
  targetKey: string;
  targetHref: string;
  name: string;
  /** e.g. "Every 50 h · 90 days". */
  interval: string;
  due: DateDisplay | null;
  /** e.g. "42 h of 50 h · 120 of 200 flights"; null for calendar-only schedules. */
  usage: string | null;
  status: StatusBadge;
  /** Overdue grounds the aircraft. */
  grounds: boolean;
}

export interface MaintenanceHistoryRowViewModel {
  id: string;
  target: string;
  targetHref: string;
  performed: DateDisplay;
  kind: 'Scheduled' | 'Unscheduled';
  scheduleName: string | null;
  description: string;
  performedBy: string;
  signedOff: boolean;
}

/** @status beta — route: /maintenance */
export interface MaintenanceScreenProps extends AsyncState {
  /** Worst-first. */
  due: MaintenanceDueRowViewModel[];
  history: MaintenanceHistoryRowViewModel[];
  /** Value is `${type}:${id}`. */
  targetOptions: { value: string; label: string }[];
  canManage: boolean;
  saving: boolean;
  empty: EmptyState;
  onAddSchedule: (input: {
    target: string;
    name: string;
    everyHours: number | null;
    everyFlights: number | null;
    everyDays: number | null;
    groundsWhenOverdue: boolean;
  }) => void;
  onLogMaintenance: (input: { scheduleId: string | null; target: string; performedOn: string; performedBy: string; description: string }) => void;
  onRemoveSchedule: (scheduleId: string) => void;
  onOpenTarget: (href: string) => void;
}

export interface InsurancePolicyViewModel {
  id: string;
  carrier: string;
  policyNumber: string;
  coverageSummary: string | null;
  liabilityLimit: string | null;
  effective: DateDisplay;
  expires: DateDisplay;
  status: StatusBadge;
  coveredAircraft: { id: string; name: string }[];
}

/** @status beta — route: /insurance */
export interface InsuranceScreenProps extends AsyncState {
  policies: InsurancePolicyViewModel[];
  /** Active aircraft no policy covers today. */
  uncoveredAircraft: { id: string; name: string }[];
  aircraftOptions: { value: string; label: string }[];
  canManage: boolean;
  saving: boolean;
  empty: EmptyState;
  onAddPolicy: (input: {
    carrier: string;
    policyNumber: string;
    coverageSummary: string | null;
    liabilityLimitDollars: number | null;
    effectiveOn: string;
    expiresOn: string;
    coveredAircraftIds: string[];
  }) => void;
  onRemovePolicy: (policyId: string) => void;
  onOpenAircraft: (aircraftId: string) => void;
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

export interface MissionRowViewModel {
  id: string;
  name: string;
  /** Planned start; null for undated drafts. */
  starts: DateDisplay | null;
  /** e.g. "Thu, Oct 22 · 9:00–11:30 AM". */
  window: string | null;
  locationName: string | null;
  pilotInCommand: string | null;
  aircraft: string[];
  status: StatusBadge & { value: 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled' };
  /** Null once completed or cancelled. */
  readiness: StatusBadge | null;
  flightCount: number;
  /** Draft, planned or in progress. */
  open: boolean;
}

/** @status beta — route: /missions */
export interface MissionsScreenProps extends AsyncState {
  /** Open missions soonest first (undated drafts last), then closed ones newest first. */
  missions: MissionRowViewModel[];
  canPlan: boolean;
  empty: EmptyState;
  onPlanMission: () => void;
  onOpenMission: (id: string) => void;
}

/** @status beta — route: /missions/[id] */
export interface MissionDetailScreenProps extends AsyncState {
  mission: {
    id: string;
    name: string;
    purpose: string | null;
    deliverables: string | null;
    status: MissionRowViewModel['status'];
    window: string | null;
    starts: DateDisplay | null;
    ends: DateDisplay | null;
    locationName: string | null;
    location: { lat: number; lon: number } | null;
    /** e.g. "200 ft AGL". */
    maxAltitude: string | null;
    operationType: string;
    crew: { pilotId: string; name: string; role: string; href: string }[];
    aircraft: { id: string; name: string; href: string }[];
    authorizations: { id: string; label: string; detail: string | null }[];
    flights: { count: number; total: string };
  } | null;
  readiness: { level: ReadinessLevel; label: string; checks: { key: string; label: string; level: ReadinessLevel; detail: string }[] } | null;
  flights: FlightRowViewModel[];
  /** Airspace, TFRs and weather at the mission's location, checked on request. */
  conditions: LogFlightScreenProps['conditions'];
  canEdit: boolean;
  canLogFlight: boolean;
  /** Status changes the member may make from here. */
  statusActions: { status: MissionRowViewModel['status']['value']; label: string }[];
  busy: boolean;
  onEdit: () => void;
  onLogFlight: () => void;
  onSetStatus: (status: MissionRowViewModel['status']['value']) => void;
  onDelete: () => void;
  onCheckConditions: () => void;
  onOpenFlight: (id: string) => void;
  /** Opens a crew member's or aircraft's page (hrefs are app-relative). */
  onOpenHref: (href: string) => void;
}

/** @status beta — routes: /missions/new, /missions/[id]/edit */
export interface MissionFormScreenProps extends AsyncState {
  mode: 'create' | 'edit';
  defaults: {
    name: string;
    purpose: string | null;
    /** ISO instants. */
    plannedStart: string | null;
    plannedEnd: string | null;
    locationName: string | null;
    location: { lat: number; lon: number } | null;
    /** In the org's altitude unit. */
    maxAltitude: number | null;
    operationType: string;
    deliverables: string | null;
    picId: string | null;
    observerIds: string[];
    aircraftIds: string[];
    authorizationIds: string[];
  };
  pilotOptions: { value: string; label: string; status: StatusBadge }[];
  aircraftOptions: { value: string; label: string; status: StatusBadge }[];
  authorizationOptions: { value: string; label: string; status: StatusBadge }[];
  operationTypeOptions: { value: string; label: string }[];
  siteOptions: { value: string; label: string }[];
  altitudeUnitLabel: string;
  fieldErrors: Record<string, string>;
  saving: boolean;
  onSubmit: (values: {
    name: string;
    purpose: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    locationName: string | null;
    location: { lat: number; lon: number } | null;
    maxAltitude: number | null;
    operationType: string;
    deliverables: string | null;
    picId: string | null;
    observerIds: string[];
    aircraftIds: string[];
    authorizationIds: string[];
    status: 'draft' | 'planned';
  }) => void;
  onCancel: () => void;
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

/** @status beta — route: /admin/checklists */
export interface ChecklistsAdminScreenProps extends AsyncState {
  templates: {
    id: string;
    name: string;
    kind: 'preflight' | 'postflight' | 'emergency' | 'other';
    kindLabel: string;
    version: number;
    isDefault: boolean;
    /** e.g. "13 items · 11 required". */
    summary: string;
    updated: DateDisplay;
    sections: { id: string; title: string; items: { id: string; text: string; required: boolean }[] }[];
  }[];
  canManage: boolean;
  saving: boolean;
  /** `id` null creates a template; otherwise publishes the next version of it. */
  onSave: (input: { id: string | null; name: string; kind: 'preflight' | 'postflight' | 'emergency' | 'other'; isDefault: boolean; sections: { id: string; title: string; items: { id: string; text: string; required: boolean }[] }[] }) => void;
  onDelete: (id: string) => void;
}

export interface AuthorizationRowViewModel {
  id: string;
  kind: 'laanc' | 'airspace_authorization' | 'waiver' | 'coa' | 'other';
  kindLabel: string;
  reference: string;
  title: string | null;
  pilot: { id: string; name: string } | null;
  validFrom: DateDisplay | null;
  validTo: DateDisplay | null;
  status: StatusBadge;
  scope: string | null;
  conditions: string | null;
  /** The signed-in member may edit or delete it. */
  canEdit: boolean;
}

/** @status beta — route: /authorizations */
export interface AuthorizationsScreenProps extends AsyncState {
  /** Expired and expiring first, then current, then not yet valid. */
  authorizations: AuthorizationRowViewModel[];
  pilotOptions: { value: string; label: string }[];
  canCreate: boolean;
  /** Pilots may only record authorizations issued to themselves. */
  ownPilotId: string | null;
  saving: boolean;
  fieldErrors: Record<string, string>;
  onSave: (input: { id: string | null; kind: AuthorizationRowViewModel['kind']; reference: string; title: string | null; pilotId: string | null; validFrom: string | null; validTo: string | null; scope: string | null; conditions: string | null }) => void;
  onDelete: (id: string) => void;
}

/** @status beta — route: /settings/discord */
export interface DiscordSettingsScreenProps extends AsyncState {
  /** False when the member has no pilot record here (only pilots can link). */
  canLink: boolean;
  linked: boolean;
  linkedAt: DateDisplay | null;
  leaderboardOptIn: boolean;
  orgLeaderboardEnabled: boolean;
  canManageOrg: boolean;
  /** A freshly issued code, shown until it expires or the page is left. */
  code: { value: string; expiresAt: string } | null;
  busy: boolean;
  onGenerateCode: () => void;
  onUnlink: () => void;
  onLeaderboardChange: (on: boolean) => void;
  onOrgLeaderboardChange: (on: boolean) => void;
}
