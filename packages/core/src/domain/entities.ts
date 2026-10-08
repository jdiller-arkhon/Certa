/**
 * Domain entities as they cross the API boundary (DTOs). All quantities are SI:
 * metres, seconds, kilograms, metres/second, degrees Celsius. Timestamps are UTC ISO-8601;
 * calendar dates are YYYY-MM-DD.
 */
import { z } from 'zod';
import {
  AircraftStatus,
  AirspaceClass,
  AuthorizationKind,
  BatteryChemistry,
  BatteryStatus,
  ChecklistKind,
  ComponentKind,
  EntityType,
  FlightSource,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  JurisdictionId,
  MaintenanceKind,
  MissionStatus,
  OperationType,
  PlanTier,
  RemoteIdMethod,
  Role,
  UnitsPreference,
} from './enums.js';

export const Id = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const IanaTimeZone = z.string().min(1).max(64);

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Metres above mean sea level, when known. */
  altMslM: z.number().nullable().optional(),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** Columns every tenant entity carries. */
export const EntityBase = z.object({
  id: Id,
  orgId: Id,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  createdBy: Id.nullable(),
  deletedAt: IsoDateTime.nullable(),
});

export const Organization = z.object({
  id: Id,
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
  planTier: PlanTier,
  defaultJurisdiction: JurisdictionId,
  timezone: IanaTimeZone,
  units: UnitsPreference,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Organization = z.infer<typeof Organization>;

export const User = z.object({
  id: Id,
  email: z.email(),
  name: z.string().min(1).max(200),
  emailVerified: z.boolean(),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const AuditorScope = z.object({
  from: IsoDate.nullable(),
  to: IsoDate.nullable(),
  pilotIds: z.array(Id).nullable(),
  aircraftIds: z.array(Id).nullable(),
});
export type AuditorScope = z.infer<typeof AuditorScope>;

export const Membership = EntityBase.extend({
  userId: Id,
  role: Role,
  /** Auditor memberships are time-boxed and scoped. */
  expiresAt: IsoDateTime.nullable(),
  auditorScope: AuditorScope.nullable(),
});
export type Membership = z.infer<typeof Membership>;

export const Pilot = EntityBase.extend({
  membershipId: Id.nullable(),
  displayName: z.string().min(1).max(200),
  email: z.email().nullable(),
  phone: z.string().max(40).nullable(),
  certificateNumber: z.string().max(40).nullable(),
  active: z.boolean(),
});
export type Pilot = z.infer<typeof Pilot>;

export const Credential = EntityBase.extend({
  pilotId: Id,
  /** Credential type id defined by the rule pack, e.g. `part107_recurrent`. */
  credentialType: z.string().min(1).max(64),
  jurisdiction: JurisdictionId,
  identifier: z.string().max(100).nullable(),
  issuedOn: IsoDate.nullable(),
  /** Explicit expiry; when null the rule pack computes it from issuedOn. */
  expiresOn: IsoDate.nullable(),
  notes: z.string().max(4000).nullable(),
  documentIds: z.array(Id),
});
export type Credential = z.infer<typeof Credential>;

export const TrainingRecord = EntityBase.extend({
  pilotId: Id,
  course: z.string().min(1).max(200),
  provider: z.string().max(200).nullable(),
  completedOn: IsoDate,
  hours: z.number().nonnegative().nullable(),
});
export type TrainingRecord = z.infer<typeof TrainingRecord>;

export const Aircraft = EntityBase.extend({
  nickname: z.string().max(100).nullable(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  serialNumber: z.string().min(1).max(100),
  registrationNumber: z.string().max(40).nullable(),
  registrationExpiresOn: IsoDate.nullable(),
  remoteIdMethod: RemoteIdMethod,
  remoteIdSerial: z.string().max(100).nullable(),
  takeoffMassKg: z.number().positive().nullable(),
  firmwareVersion: z.string().max(60).nullable(),
  status: AircraftStatus,
  groundedReason: z.string().max(1000).nullable(),
  totalFlightSeconds: z.number().int().nonnegative(),
  totalFlights: z.number().int().nonnegative(),
});
export type Aircraft = z.infer<typeof Aircraft>;

export const Component = EntityBase.extend({
  kind: ComponentKind,
  name: z.string().min(1).max(200),
  serialNumber: z.string().max(100).nullable(),
  aircraftId: Id.nullable(),
  flightSeconds: z.number().int().nonnegative(),
  cycles: z.number().int().nonnegative(),
  limitFlightSeconds: z.number().int().positive().nullable(),
  limitCycles: z.number().int().positive().nullable(),
  installedAt: IsoDateTime.nullable(),
});
export type Component = z.infer<typeof Component>;

export const BatteryRetirementThresholds = z.object({
  maxCycles: z.number().int().positive().nullable(),
  minCapacityPct: z.number().min(0).max(100).nullable(),
  maxCellDeviationMv: z.number().positive().nullable(),
  maxAgeDays: z.number().int().positive().nullable(),
});
export type BatteryRetirementThresholds = z.infer<typeof BatteryRetirementThresholds>;

export const Battery = EntityBase.extend({
  serialNumber: z.string().min(1).max(100),
  label: z.string().max(60).nullable(),
  chemistry: BatteryChemistry,
  cellCount: z.number().int().positive().nullable(),
  ratedCapacityMah: z.number().int().positive().nullable(),
  cycleCount: z.number().int().nonnegative(),
  status: BatteryStatus,
  aircraftModel: z.string().max(100).nullable(),
  purchasedOn: IsoDate.nullable(),
  thresholds: BatteryRetirementThresholds,
  notes: z.string().max(4000).nullable(),
});
export type Battery = z.infer<typeof Battery>;

export const WeatherSnapshot = z.object({
  provider: z.string(),
  fetchedAt: IsoDateTime,
  temperatureC: z.number().nullable(),
  windSpeedMps: z.number().nullable(),
  windGustMps: z.number().nullable(),
  windDirectionDeg: z.number().nullable(),
  visibilityM: z.number().nullable(),
  cloudBaseM: z.number().nullable(),
  precipitationMm: z.number().nullable(),
  summary: z.string().nullable(),
});
export type WeatherSnapshot = z.infer<typeof WeatherSnapshot>;

export const FlightBatteryUse = z.object({
  batteryId: Id,
  startPct: z.number().min(0).max(100).nullable(),
  endPct: z.number().min(0).max(100).nullable(),
});

export const Flight = EntityBase.extend({
  pilotInCommandId: Id,
  visualObserverIds: z.array(Id),
  aircraftId: Id,
  batteries: z.array(FlightBatteryUse),
  takeoffAt: IsoDateTime,
  landingAt: IsoDateTime,
  /** IANA zone of the takeoff location; used for display only. */
  localTimeZone: IanaTimeZone,
  takeoffPoint: GeoPoint.nullable(),
  landingPoint: GeoPoint.nullable(),
  locationName: z.string().max(300).nullable(),
  durationSeconds: z.number().int().nonnegative(),
  maxAltitudeAglM: z.number().nullable(),
  maxDistanceM: z.number().nonnegative().nullable(),
  totalDistanceM: z.number().nonnegative().nullable(),
  hasPath: z.boolean(),
  weather: WeatherSnapshot.nullable(),
  airspaceClass: AirspaceClass.nullable(),
  authorizationId: Id.nullable(),
  missionId: Id.nullable(),
  siteId: Id.nullable(),
  operationType: OperationType,
  notes: z.string().max(10000).nullable(),
  source: FlightSource,
  importParser: z.string().max(60).nullable(),
  rawLogDocumentId: Id.nullable(),
});
export type Flight = z.infer<typeof Flight>;

export const Client = EntityBase.extend({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullable(),
  contactEmail: z.email().nullable(),
  notes: z.string().max(4000).nullable(),
});
export type Client = z.infer<typeof Client>;

export const Site = EntityBase.extend({
  clientId: Id.nullable(),
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable(),
  location: GeoPoint.nullable(),
  /** GeoJSON Polygon in WGS84, when the site has a boundary. */
  boundary: z.unknown().nullable(),
  notes: z.string().max(4000).nullable(),
});
export type Site = z.infer<typeof Site>;

export const Mission = EntityBase.extend({
  name: z.string().min(1).max(200),
  clientId: Id.nullable(),
  siteId: Id.nullable(),
  purpose: z.string().max(2000).nullable(),
  plannedStart: IsoDateTime.nullable(),
  plannedEnd: IsoDateTime.nullable(),
  status: MissionStatus,
  crewPilotIds: z.array(Id),
  aircraftIds: z.array(Id),
  authorizationIds: z.array(Id),
  deliverables: z.string().max(4000).nullable(),
});
export type Mission = z.infer<typeof Mission>;

export const Authorization = EntityBase.extend({
  kind: AuthorizationKind,
  reference: z.string().min(1).max(100),
  title: z.string().max(200).nullable(),
  scope: z.string().max(4000).nullable(),
  conditions: z.string().max(10000).nullable(),
  validFrom: IsoDateTime.nullable(),
  validTo: IsoDateTime.nullable(),
  geometry: z.unknown().nullable(),
  documentIds: z.array(Id),
});
export type Authorization = z.infer<typeof Authorization>;

export const ChecklistItem = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(500),
  required: z.boolean(),
  photoRequired: z.boolean(),
});
export const ChecklistSection = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  items: z.array(ChecklistItem),
});
export const ChecklistTemplate = EntityBase.extend({
  name: z.string().min(1).max(200),
  kind: ChecklistKind,
  version: z.number().int().positive(),
  isDefault: z.boolean(),
  sections: z.array(ChecklistSection),
});
export type ChecklistTemplate = z.infer<typeof ChecklistTemplate>;

export const ChecklistResponse = z.object({
  itemId: z.string(),
  checked: z.boolean(),
  note: z.string().max(2000).nullable(),
  photoDocumentId: Id.nullable(),
  at: IsoDateTime,
});
export const ChecklistRun = EntityBase.extend({
  templateId: Id,
  templateVersion: z.number().int().positive(),
  flightId: Id.nullable(),
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
  location: GeoPoint.nullable(),
  responses: z.array(ChecklistResponse),
  signedByPilotId: Id.nullable(),
  signedAt: IsoDateTime.nullable(),
});
export type ChecklistRun = z.infer<typeof ChecklistRun>;

export const MaintenanceTarget = z.object({
  type: z.enum(['aircraft', 'component', 'battery']),
  id: Id,
});
export const MaintenanceSchedule = EntityBase.extend({
  name: z.string().min(1).max(200),
  target: MaintenanceTarget,
  everyFlightSeconds: z.number().int().positive().nullable(),
  everyFlights: z.number().int().positive().nullable(),
  everyDays: z.number().int().positive().nullable(),
  lastDoneAt: IsoDateTime.nullable(),
  lastDoneFlightSeconds: z.number().int().nonnegative().nullable(),
  lastDoneFlights: z.number().int().nonnegative().nullable(),
  groundsWhenOverdue: z.boolean(),
});
export type MaintenanceSchedule = z.infer<typeof MaintenanceSchedule>;

export const MaintenanceEvent = EntityBase.extend({
  kind: MaintenanceKind,
  scheduleId: Id.nullable(),
  target: MaintenanceTarget,
  performedAt: IsoDateTime,
  performedBy: z.string().max(200),
  description: z.string().min(1).max(10000),
  partsReplaced: z.array(z.object({ name: z.string(), serialNumber: z.string().nullable() })),
  flightSecondsAtService: z.number().int().nonnegative().nullable(),
  signedOffByUserId: Id.nullable(),
  signedOffAt: IsoDateTime.nullable(),
  documentIds: z.array(Id),
});
export type MaintenanceEvent = z.infer<typeof MaintenanceEvent>;

export const IncidentFacts = z.object({
  /** Highest Abbreviated Injury Scale level suffered by any person, if any. */
  maxInjuryAisLevel: z.number().int().min(0).max(6).nullable(),
  lossOfConsciousness: z.boolean().nullable(),
  /** Repair or replacement cost of damage to property other than the aircraft, in USD cents. */
  thirdPartyPropertyDamageCents: z.number().int().nonnegative().nullable(),
  aircraftDamaged: z.boolean().nullable(),
});
export type IncidentFacts = z.infer<typeof IncidentFacts>;

export const Incident = EntityBase.extend({
  type: IncidentType,
  severity: IncidentSeverity,
  status: IncidentStatus,
  occurredAt: IsoDateTime,
  location: GeoPoint.nullable(),
  aircraftId: Id.nullable(),
  pilotId: Id.nullable(),
  flightId: Id.nullable(),
  summary: z.string().min(1).max(500),
  narrative: z.string().max(20000).nullable(),
  facts: IncidentFacts,
  reportedToRegulatorAt: IsoDateTime.nullable(),
  regulatorReference: z.string().max(100).nullable(),
});
export type Incident = z.infer<typeof Incident>;

export const CorrectiveAction = EntityBase.extend({
  incidentId: Id,
  description: z.string().min(1).max(4000),
  ownerUserId: Id.nullable(),
  dueOn: IsoDate.nullable(),
  closedAt: IsoDateTime.nullable(),
});
export type CorrectiveAction = z.infer<typeof CorrectiveAction>;

export const InsurancePolicy = EntityBase.extend({
  carrier: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  coverageSummary: z.string().max(4000).nullable(),
  liabilityLimitCents: z.number().int().nonnegative().nullable(),
  effectiveOn: IsoDate,
  expiresOn: IsoDate,
  coveredAircraftIds: z.array(Id),
  documentIds: z.array(Id),
});
export type InsurancePolicy = z.infer<typeof InsurancePolicy>;

export const Document = EntityBase.extend({
  ownerType: EntityType,
  ownerId: Id,
  fileName: z.string().min(1).max(300),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Document = z.infer<typeof Document>;

export const AuditEvent = z.object({
  id: z.number().int(),
  orgId: Id.nullable(),
  at: IsoDateTime,
  actorUserId: Id.nullable(),
  requestId: z.string().nullable(),
  tableName: z.string(),
  rowId: z.string(),
  operation: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
