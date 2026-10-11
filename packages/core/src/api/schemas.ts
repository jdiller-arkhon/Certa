/**
 * Request/response schemas for the REST API. The Fastify routes use these directly, so the
 * OpenAPI document in contract/openapi.yaml is generated from exactly this code.
 */
import { z } from 'zod';
import { Aircraft, AuditEvent, Battery, BatteryRetirementThresholds, Credential, Flight, FlightBatteryUse, GeoPoint, IanaTimeZone, Id, InsurancePolicy, IsoDate, IsoDateTime, MaintenanceEvent, MaintenanceSchedule, Membership, Organization, Pilot, TrainingRecord, User, WeatherSnapshot } from '../domain/entities.js';
import { AirspaceClass, BatteryChemistry, BatteryStatus, JurisdictionId, OperationType, PlanTier, RemoteIdMethod, Role, UnitsPreference } from '../domain/enums.js';
import { FleetSnapshot, GoNoGoResult } from '../fleet/fleet.js';
import { ACTIONS } from '../domain/permissions.js';
import { Rule, RuleSource } from '../rules/schema.js';

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['ok', 'fail'])),
});

// ---------- Auth & session ----------

export const SignUpRequest = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  password: z.string().min(12).max(256),
  organizationName: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64).default('America/New_York'),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

export const MembershipSummary = z.object({
  membershipId: Id,
  orgId: Id,
  orgName: z.string(),
  role: Role,
  expiresAt: IsoDateTime.nullable(),
});
export type MembershipSummary = z.infer<typeof MembershipSummary>;

export const MeResponse = z.object({
  user: User,
  memberships: z.array(MembershipSummary),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SignUpResponse = MeResponse;

// ---------- Organizations & members ----------

export const OrgContextResponse = z.object({
  organization: Organization,
  membership: Membership,
  permissions: z.array(z.enum(ACTIONS)),
});
export type OrgContextResponse = z.infer<typeof OrgContextResponse>;

export const CreateOrganizationRequest = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64),
  defaultJurisdiction: JurisdictionId.default('US-FAA-Part107'),
  units: UnitsPreference.optional(),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequest>;

export const UpdateOrganizationRequest = z.object({
  name: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).max(64).optional(),
  units: UnitsPreference.optional(),
  defaultJurisdiction: JurisdictionId.optional(),
  planTier: PlanTier.optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequest>;

export const MemberRow = z.object({
  membershipId: Id,
  userId: Id,
  name: z.string(),
  email: z.email(),
  role: Role,
  expiresAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type MemberRow = z.infer<typeof MemberRow>;

export const MemberListResponse = z.object({ members: z.array(MemberRow) });

export const AddMemberRequest = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  role: Role,
  expiresAt: IsoDateTime.nullable().optional(),
});
export type AddMemberRequest = z.infer<typeof AddMemberRequest>;

export const UpdateMemberRequest = z.object({
  role: Role.optional(),
  expiresAt: IsoDateTime.nullable().optional(),
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequest>;

// ---------- Rule packs ----------

export const RulePackSummary = z.object({
  id: Id,
  jurisdiction: JurisdictionId,
  version: z.string(),
  name: z.string(),
  authority: z.string(),
  effectiveFrom: z.iso.date(),
  disclaimer: z.string(),
  ruleCount: z.number().int(),
  unverifiedCount: z.number().int(),
  active: z.boolean(),
});
export type RulePackSummary = z.infer<typeof RulePackSummary>;

export const RuleRow = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  kind: z.string(),
  appliesTo: z.string(),
  /** Effective value after any org override, as stored (SI). */
  value: z.unknown(),
  packValue: z.unknown(),
  unit: z.string().nullable(),
  statedAs: z.string().nullable(),
  source: RuleSource,
  lastVerifiedOn: z.iso.date().nullable(),
  needsVerification: z.boolean(),
  notes: z.string().nullable(),
  override: z
    .object({
      value: z.unknown(),
      reason: z.string(),
      setBy: z.string().nullable(),
      setAt: IsoDateTime,
    })
    .nullable(),
});
export type RuleRow = z.infer<typeof RuleRow>;

export const RulePackDetailResponse = z.object({
  pack: RulePackSummary,
  credentialTypes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      validityRuleId: z.string().nullable(),
      requiredForCurrency: z.boolean(),
    }),
  ),
  rules: z.array(RuleRow),
});
export type RulePackDetailResponse = z.infer<typeof RulePackDetailResponse>;

export const RulePackListResponse = z.object({ packs: z.array(RulePackSummary) });

export const SetRuleOverrideRequest = z.object({
  value: z.unknown(),
  reason: z.string().min(3).max(2000),
});
export type SetRuleOverrideRequest = z.infer<typeof SetRuleOverrideRequest>;

export { Rule };

// ---------- Audit ----------

export const AuditListQuery = z.object({
  table: z.string().optional(),
  rowId: z.string().optional(),
  actorUserId: Id.optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditListQuery = z.infer<typeof AuditListQuery>;

export const AuditListResponse = z.object({
  events: z.array(AuditEvent.extend({ actorName: z.string().nullable() })),
  nextBefore: z.number().int().nullable(),
});
export type AuditListResponse = z.infer<typeof AuditListResponse>;

// ---------- Fleet snapshot (Phase 2) ----------

export const FleetSnapshotResponse = FleetSnapshot;
export type FleetSnapshotResponse = z.infer<typeof FleetSnapshotResponse>;

const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();

// ---------- Pilots, credentials, training ----------

export const CreatePilotRequest = z.object({
  displayName: z.string().min(1).max(200),
  email: z.email().nullable().optional(),
  phone: opt(z.string().max(40)),
  certificateNumber: opt(z.string().max(40)),
});
export type CreatePilotRequest = z.infer<typeof CreatePilotRequest>;
export const UpdatePilotRequest = CreatePilotRequest.partial().extend({ active: z.boolean().optional() });
export type UpdatePilotRequest = z.infer<typeof UpdatePilotRequest>;

export const CreateCredentialRequest = z.object({
  credentialType: z.string().min(1).max(64),
  jurisdiction: JurisdictionId.optional(),
  identifier: opt(z.string().max(100)),
  issuedOn: opt(IsoDate),
  expiresOn: opt(IsoDate),
  notes: opt(z.string().max(4000)),
});
export type CreateCredentialRequest = z.infer<typeof CreateCredentialRequest>;
export const UpdateCredentialRequest = CreateCredentialRequest.partial();
export type UpdateCredentialRequest = z.infer<typeof UpdateCredentialRequest>;

export const CreateTrainingRecordRequest = z.object({
  course: z.string().min(1).max(200),
  provider: opt(z.string().max(200)),
  completedOn: IsoDate,
  hours: opt(z.number().nonnegative()),
});
export const TrainingRecordListResponse = z.object({ records: z.array(TrainingRecord) });

// ---------- Aircraft ----------

export const CreateAircraftRequest = z.object({
  nickname: opt(z.string().max(100)),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  serialNumber: z.string().min(1).max(100),
  registrationNumber: opt(z.string().max(40)),
  registrationExpiresOn: opt(IsoDate),
  remoteIdMethod: RemoteIdMethod.default('standard'),
  remoteIdSerial: opt(z.string().max(100)),
  takeoffMassKg: opt(z.number().positive().max(1000)),
  firmwareVersion: opt(z.string().max(60)),
});
export type CreateAircraftRequest = z.infer<typeof CreateAircraftRequest>;
export const UpdateAircraftRequest = CreateAircraftRequest.partial().extend({ status: z.enum(['active', 'retired']).optional() });
export type UpdateAircraftRequest = z.infer<typeof UpdateAircraftRequest>;
export const GroundAircraftRequest = z.object({ reason: z.string().min(3).max(1000) });

// ---------- Batteries ----------

export const CreateBatteryRequest = z.object({
  serialNumber: z.string().min(1).max(100),
  label: opt(z.string().max(60)),
  chemistry: BatteryChemistry.default('lipo'),
  cellCount: opt(z.number().int().positive().max(24)),
  ratedCapacityMah: opt(z.number().int().positive()),
  aircraftModel: opt(z.string().max(100)),
  purchasedOn: opt(IsoDate),
  thresholds: BatteryRetirementThresholds.partial().optional(),
  notes: opt(z.string().max(4000)),
});
export type CreateBatteryRequest = z.infer<typeof CreateBatteryRequest>;
export const UpdateBatteryRequest = CreateBatteryRequest.partial().extend({ status: BatteryStatus.optional() });
export type UpdateBatteryRequest = z.infer<typeof UpdateBatteryRequest>;

// ---------- Flights ----------

export const CreateFlightRequest = z.object({
  /** Client-generated id (UUIDv7) so an offline device can retry safely: re-sending is a no-op. */
  id: Id.optional(),
  pilotInCommandId: Id,
  visualObserverIds: z.array(Id).max(10).default([]),
  aircraftId: Id,
  batteries: z.array(FlightBatteryUse).max(12).default([]),
  takeoffAt: IsoDateTime,
  landingAt: IsoDateTime,
  localTimeZone: IanaTimeZone,
  takeoffPoint: GeoPoint.nullable().optional(),
  locationName: opt(z.string().max(300)),
  maxAltitudeAglM: opt(z.number().min(0).max(20000)),
  maxDistanceM: opt(z.number().nonnegative()),
  operationType: OperationType.default('commercial'),
  airspaceClass: AirspaceClass.nullable().optional(),
  weather: WeatherSnapshot.nullable().optional(),
  notes: opt(z.string().max(10000)),
  /** Pre-flight go/no-go shown to the pilot at logging time, stored with the flight. */
  goNoGo: GoNoGoResult.nullable().optional(),
});
export type CreateFlightRequest = z.infer<typeof CreateFlightRequest>;
export const UpdateFlightRequest = CreateFlightRequest.omit({ id: true, goNoGo: true }).partial();
export type UpdateFlightRequest = z.infer<typeof UpdateFlightRequest>;

export const FlightListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  pilotId: Id.optional(),
  aircraftId: Id.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});
export type FlightListQuery = z.infer<typeof FlightListQuery>;

export const FlightWithGoNoGo = Flight.extend({ goNoGo: GoNoGoResult.nullable() });
export type FlightWithGoNoGo = z.infer<typeof FlightWithGoNoGo>;

export const FlightListResponse = z.object({
  items: z.array(Flight),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  totals: z.object({ flights: z.number().int(), flightSeconds: z.number().int() }),
});
export type FlightListResponse = z.infer<typeof FlightListResponse>;

export const PreflightRequest = z.object({
  pilotId: Id,
  aircraftId: Id,
  batteryIds: z.array(Id).max(12).default([]),
});
export const PreflightResponse = GoNoGoResult;

// ---------- Insurance ----------

export const CreateInsurancePolicyRequest = z.object({
  carrier: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  coverageSummary: opt(z.string().max(4000)),
  liabilityLimitCents: opt(z.number().int().nonnegative()),
  effectiveOn: IsoDate,
  expiresOn: IsoDate,
  coveredAircraftIds: z.array(Id).max(500).default([]),
});
export type CreateInsurancePolicyRequest = z.infer<typeof CreateInsurancePolicyRequest>;
export const UpdateInsurancePolicyRequest = CreateInsurancePolicyRequest.partial();
export const InsurancePolicyResponse = InsurancePolicy;

// ---------- Maintenance ----------

export const CreateMaintenanceScheduleRequest = z.object({
  name: z.string().min(1).max(200),
  target: z.object({ type: z.enum(['aircraft', 'component', 'battery']), id: Id }),
  everyFlightSeconds: opt(z.number().int().positive()),
  everyFlights: opt(z.number().int().positive()),
  everyDays: opt(z.number().int().positive()),
  groundsWhenOverdue: z.boolean().default(true),
});
export type CreateMaintenanceScheduleRequest = z.infer<typeof CreateMaintenanceScheduleRequest>;
export const MaintenanceScheduleResponse = MaintenanceSchedule;

export const LogMaintenanceRequest = z.object({
  scheduleId: Id.nullable().optional(),
  target: z.object({ type: z.enum(['aircraft', 'component', 'battery']), id: Id }),
  performedAt: IsoDateTime,
  performedBy: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  partsReplaced: z.array(z.object({ name: z.string().min(1).max(200), serialNumber: z.string().max(100).nullable() })).max(50).default([]),
});
export type LogMaintenanceRequest = z.infer<typeof LogMaintenanceRequest>;
export const MaintenanceEventListResponse = z.object({ events: z.array(MaintenanceEvent) });

export { Aircraft as AircraftResponse, Battery as BatteryResponse, Credential as CredentialResponse, Pilot as PilotResponse };
