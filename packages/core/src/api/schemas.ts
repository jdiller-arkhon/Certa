/**
 * Request/response schemas for the REST API. The Fastify routes use these directly, so the
 * OpenAPI document in contract/openapi.yaml is generated from exactly this code.
 */
import { z } from 'zod';
import { Aircraft, AuditEvent, Authorization, Mission, ChecklistSection, ChecklistTemplate, Battery, BatteryRetirementThresholds, Credential, Flight, FlightBatteryUse, GeoPoint, IanaTimeZone, Id, InsurancePolicy, IsoDate, IsoDateTime, MaintenanceEvent, MaintenanceSchedule, Membership, Organization, Pilot, PriorExperience, ExternalFlight, TrainingRecord, User, WeatherSnapshot } from '../domain/entities.js';
import { AirspaceClass, AuthorizationKind, MissionStatus, BatteryChemistry, ChecklistKind, BatteryStatus, JurisdictionId, OperationType, PlanTier, RemoteIdMethod, Role, UnitsPreference } from '../domain/enums.js';
import { FleetSnapshot, GoNoGoResult } from '../fleet/fleet.js';
import { InspectorPacket } from '../fleet/packet.js';
import { FlightVerificationResult, VerificationResult } from '../fleet/verify.js';
import { ACTIONS } from '../domain/permissions.js';
import { Rule, RuleSource } from '../rules/schema.js';

export const ErrorResponse = z.object({
  /** Same as error.message, for clients that read only a top-level message. */
  message: z.string().optional(),
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
  /** Set when the account signs in with Arkhon: its Arkhon role at the last sign-in. */
  arkhon: z.object({ role: z.enum(['client', 'pilot', 'admin']), platformAdmin: z.boolean() }).nullable().default(null),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SignUpResponse = MeResponse;

/** Which sign-in methods this deployment offers (public). */
export const AuthConfigResponse = z.object({
  /** Certa's own email/password and magic-link sign-in and sign-up. */
  local: z.boolean(),
  /** Arkhon single sign-on; `loginUrl` is the Arkhon sign-in page that returns to Certa. */
  arkhon: z.object({ loginUrl: z.string(), signupUrl: z.string() }).nullable(),
});
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;

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

export const CreatePriorExperienceRequest = z.object({
  source: z.string().trim().min(1).max(100),
  flights: z.number().int().nonnegative().max(1_000_000),
  missions: z.number().int().nonnegative().max(1_000_000),
  flightSeconds: z.number().int().nonnegative().max(100_000 * 3600),
  asOf: IsoDate,
  notes: opt(z.string().max(2000)),
});
export type CreatePriorExperienceRequest = z.infer<typeof CreatePriorExperienceRequest>;
export const UpdatePriorExperienceRequest = CreatePriorExperienceRequest.partial();
export type UpdatePriorExperienceRequest = z.infer<typeof UpdatePriorExperienceRequest>;

/** Argus → Certa: a flight from an Argus job the pilot marked landed. Idempotent per jobId. */
export const ArgusFlightIngestRequest = z.object({
  /** The pilot's Arkhon user id, name and verified email (Certa links or creates the account). */
  pilot: z.object({ arkhonUserId: z.string().min(1).max(200), name: z.string().min(1).max(200), email: z.email() }),
  jobId: z.string().min(1).max(100),
  reference: z.string().max(200).nullable().optional(),
  takeoffAt: IsoDateTime,
  landingAt: IsoDateTime,
  locationName: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});
export type ArgusFlightIngestRequest = z.infer<typeof ArgusFlightIngestRequest>;
export const ArgusFlightIngestResponse = z.object({ status: z.enum(['created', 'updated', 'unchanged']), externalFlightId: Id });

export const ConvertExternalFlightRequest = z.object({ aircraftId: Id });
export const ConvertExternalFlightResponse = z.object({ flightId: Id });

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
  batteries: z.array(FlightBatteryUse).max(12).refine((bs) => new Set(bs.map((b) => b.batteryId)).size === bs.length, 'Each battery can be listed once per flight').default([]),
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
  /**
   * Pre-flight go/no-go the pilot saw on the device. Informational: the server recomputes the
   * check from records on file when it stores the flight and keeps its own result.
   */
  goNoGo: GoNoGoResult.nullable().optional(),
  /** LAANC approval, airspace authorization, or waiver the flight operated under. */
  authorizationId: Id.nullable().optional(),
  /** The planned mission this flight was flown for. */
  missionId: Id.nullable().optional(),
  /** The pre-flight checklist as the pilot ticked it. Stored as a signed run linked to the flight. */
  checklist: z
    .object({
      templateId: Id,
      templateVersion: z.number().int().positive(),
      responses: z.array(z.object({ itemId: z.string().min(1).max(64), checked: z.boolean(), note: opt(z.string().max(2000)) })).max(200),
    })
    .nullable()
    .optional(),
});
export type CreateFlightRequest = z.infer<typeof CreateFlightRequest>;
export const UpdateFlightRequest = CreateFlightRequest.omit({ id: true, goNoGo: true, checklist: true }).partial();
export type UpdateFlightRequest = z.infer<typeof UpdateFlightRequest>;

export const FlightListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  pilotId: Id.optional(),
  aircraftId: Id.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  missionId: Id.optional(),
});
export type FlightListQuery = z.infer<typeof FlightListQuery>;

/** The checklist run stored with a flight, resolved against the template version it used. */
export const FlightChecklist = z.object({
  templateName: z.string(),
  templateVersion: z.number().int(),
  completed: z.boolean(),
  signedAt: IsoDateTime.nullable(),
  sections: z.array(z.object({ title: z.string(), items: z.array(z.object({ id: z.string(), text: z.string(), required: z.boolean(), checked: z.boolean(), note: z.string().nullable() })) })),
});
export type FlightChecklist = z.infer<typeof FlightChecklist>;

export const FlightWithGoNoGo = Flight.extend({
  goNoGo: GoNoGoResult.nullable(),
  checklist: FlightChecklist.nullable().optional(),
  /** The authorization the flight named, even if it has since been deleted from the list. */
  authorization: z.object({ kind: AuthorizationKind, reference: z.string(), title: z.string().nullable() }).nullable().optional(),
});
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

export { Aircraft as AircraftResponse, Battery as BatteryResponse, Credential as CredentialResponse, Pilot as PilotResponse, PriorExperience as PriorExperienceResponse, ExternalFlight as ExternalFlightResponse };

// ---------- Inspector packet share links ----------

export const CreateShareLinkRequest = z.object({
  subjectType: z.enum(['pilot', 'aircraft']),
  subjectId: Id,
  label: z.string().min(1).max(200).optional(),
  /** Link lifetime; inspectors usually need it for a few days. */
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateShareLinkRequest = z.infer<typeof CreateShareLinkRequest>;

export const ShareLink = z.object({
  id: Id,
  subjectType: z.enum(['pilot', 'aircraft']),
  subjectId: Id,
  label: z.string(),
  expiresAt: IsoDateTime,
  revokedAt: IsoDateTime.nullable(),
  viewCount: z.number().int(),
  lastViewedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type ShareLink = z.infer<typeof ShareLink>;

/** Returned once at creation: the only time the secret URL is available. */
export const CreatedShareLink = ShareLink.extend({ url: z.url() });
export const ShareLinkListResponse = z.object({ links: z.array(ShareLink) });

export const PublicPacketResponse = z.object({
  label: z.string(),
  expiresAt: IsoDateTime,
  /** SHA-256 of the canonical packet JSON; printed on the PDF. */
  seal: z.string().regex(/^[a-f0-9]{64}$/),
  packet: InspectorPacket,
});
export type PublicPacketResponse = z.infer<typeof PublicPacketResponse>;

// ---------- API keys and machine verification (Argus) ----------

export const API_KEY_SCOPES = ['verify:read'] as const;
export const ApiKeyScope = z.enum(API_KEY_SCOPES);

export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(ApiKeyScope).min(1).default(['verify:read']),
  /** Omit for a key that doesn't expire (rotate it from the admin page). */
  expiresInDays: z.number().int().min(1).max(730).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;

export const ApiKey = z.object({
  id: Id,
  name: z.string(),
  /** Public part shown in lists, e.g. ck_7Hq2… */
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type ApiKey = z.infer<typeof ApiKey>;
/** Returned once at creation: the full secret key. */
export const CreatedApiKey = ApiKey.extend({ key: z.string() });
export const ApiKeyListResponse = z.object({ keys: z.array(ApiKey) });

export const VerifyLookupQuery = z
  .object({ certificateNumber: z.string().max(40).optional(), registration: z.string().max(40).optional(), serialNumber: z.string().max(100).optional() })
  .refine((q) => Object.values(q).filter(Boolean).length === 1, 'Give exactly one of certificateNumber, registration, serialNumber');
export const VerifyFlightRequest = PreflightRequest;
export { VerificationResult as VerificationResponse, FlightVerificationResult as FlightVerificationResponse };

// ---------- Checklists ----------

export const ChecklistTemplateRequest = z.object({
  name: z.string().trim().min(1).max(200),
  kind: ChecklistKind.default('preflight'),
  isDefault: z.boolean().default(false),
  sections: z
    .array(ChecklistSection)
    .min(1)
    .max(20)
    .refine((ss) => ss.every((s) => s.items.length > 0), 'Every section needs at least one item')
    .refine((ss) => {
      const ids = ss.flatMap((s) => s.items.map((i) => i.id));
      return new Set(ids).size === ids.length;
    }, 'Item ids must be unique'),
});
export type ChecklistTemplateRequest = z.infer<typeof ChecklistTemplateRequest>;
export const ChecklistTemplateResponse = ChecklistTemplate;
export const ChecklistTemplateListResponse = z.object({ templates: z.array(ChecklistTemplate) });

// ---------- Authorizations (LAANC, airspace authorizations, waivers, COAs) ----------

export const AuthorizationRecord = Authorization.omit({ geometry: true, documentIds: true }).extend({
  /** The pilot it was issued to; null for org-wide waivers. */
  pilotId: Id.nullable(),
});
export type AuthorizationRecord = z.infer<typeof AuthorizationRecord>;

export const CreateAuthorizationRequest = z
  .object({
    kind: AuthorizationKind,
    reference: z.string().trim().min(1).max(100),
    title: opt(z.string().trim().max(200)),
    scope: opt(z.string().max(4000)),
    conditions: opt(z.string().max(10000)),
    validFrom: IsoDateTime.nullable().optional(),
    validTo: IsoDateTime.nullable().optional(),
    pilotId: Id.nullable().optional(),
  })
  .refine((a) => !a.validFrom || !a.validTo || Date.parse(a.validTo) > Date.parse(a.validFrom), { message: 'Valid until must be after valid from', path: ['validTo'] });
export type CreateAuthorizationRequest = z.infer<typeof CreateAuthorizationRequest>;
export const UpdateAuthorizationRequest = z.object({
  kind: AuthorizationKind.optional(),
  reference: z.string().trim().min(1).max(100).optional(),
  title: opt(z.string().trim().max(200)),
  scope: opt(z.string().max(4000)),
  conditions: opt(z.string().max(10000)),
  validFrom: IsoDateTime.nullable().optional(),
  validTo: IsoDateTime.nullable().optional(),
  pilotId: Id.nullable().optional(),
});
export type UpdateAuthorizationRequest = z.infer<typeof UpdateAuthorizationRequest>;
export const AuthorizationListResponse = z.object({ authorizations: z.array(AuthorizationRecord) });

// ---------- Discord link (community bot) ----------

/** A pilot's own link status, for Settings → Discord. */
export const DiscordLinkStatus = z.object({
  /** False when the signed-in member has no pilot record in this org (nothing to link). */
  canLink: z.boolean(),
  linked: z.boolean(),
  linkedAt: IsoDateTime.nullable(),
  leaderboardOptIn: z.boolean(),
  /** Org-wide switch an admin controls; when off, no one in the org appears on the leaderboard. */
  orgLeaderboardEnabled: z.boolean(),
  canManageOrg: z.boolean(),
});
export type DiscordLinkStatus = z.infer<typeof DiscordLinkStatus>;
export const DiscordLinkCode = z.object({ code: z.string(), expiresAt: IsoDateTime });
export const UpdateDiscordLinkRequest = z.object({ leaderboardOptIn: z.boolean() });
export const UpdateDiscordOrgSettingsRequest = z.object({ leaderboardEnabled: z.boolean() });

/** Discord snowflake ids are 17–20 digit integers. */
const Snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord user id');

export const BotRedeemRequest = z.object({ code: z.string().trim().min(6).max(40), discordUserId: Snowflake });
export const BotRedeemResponse = z.object({ certaUserId: Id, displayName: z.string() });
export const BotUserParams = z.object({ certaUserId: Id });

export const BOT_MISSION_TYPES = ['Commercial', 'Recreational', 'Training', 'Inspection', 'Mapping', 'Cinematography', 'Other'] as const;
export const BotFlightRequest = z.object({
  date: IsoDate,
  location: z.string().trim().min(1).max(100),
  locationIsIcao: z.boolean(),
  aircraft: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(1).max(1440),
  missionType: z.enum(BOT_MISSION_TYPES),
  notes: z.string().trim().max(1000).optional(),
});
export type BotFlightRequest = z.infer<typeof BotFlightRequest>;
export const BotFlightResponse = z.object({ flightId: Id });

const BotPeriod = z.object({ flights: z.number().int().nonnegative(), minutes: z.number().int().nonnegative() });
export const BotTotalsResponse = z.object({
  totalFlights: z.number().int().nonnegative(),
  totalMinutes: z.number().int().nonnegative(),
  last30Days: BotPeriod,
  last90Days: BotPeriod,
  last365Days: BotPeriod,
});
export const BotCurrencyResponse = z.object({
  lastTrainingDate: IsoDate.nullable(),
  lastTrainingKind: z.enum(['initial', 'recurrent']).nullable(),
  /** Recurrent training due date from the org's rule pack; null when nothing is on file. */
  dueDate: IsoDate.nullable(),
  status: z.enum(['current', 'due_soon', 'overdue', 'unknown']),
});
export const BotLeaderboardQuery = z.object({
  period: z.enum(['month', 'all']).default('month'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const BotLeaderboardResponse = z.object({
  entries: z.array(z.object({ rank: z.number().int().positive(), certaUserId: Id, displayName: z.string(), totalMinutes: z.number().int().nonnegative(), flightCount: z.number().int().nonnegative() })),
});

// ---------- Missions ----------

export const MissionRecord = Mission.omit({ clientId: true, siteId: true }).extend({
  /** Flights logged against the mission so far. */
  flightCount: z.number().int(),
  flightSeconds: z.number().int(),
});
export type MissionRecord = z.infer<typeof MissionRecord>;

const MissionCrew = z
  .array(z.object({ pilotId: Id, role: z.enum(['pic', 'observer']) }))
  .max(20)
  .refine((c) => c.filter((x) => x.role === 'pic').length <= 1, { message: 'Only one pilot in command' })
  .refine((c) => new Set(c.map((x) => x.pilotId)).size === c.length, { message: 'A pilot is listed twice' });

const missionFields = {
  name: z.string().trim().min(1).max(200),
  purpose: opt(z.string().max(2000)),
  plannedStart: IsoDateTime.nullable().optional(),
  plannedEnd: IsoDateTime.nullable().optional(),
  locationName: opt(z.string().trim().max(200)),
  location: GeoPoint.nullable().optional(),
  maxAltitudeAglM: z.number().min(0).max(5000).nullable().optional(),
  operationType: OperationType.optional(),
  deliverables: opt(z.string().max(4000)),
  crew: MissionCrew.optional(),
  aircraftIds: z.array(Id).max(20).optional(),
  authorizationIds: z.array(Id).max(20).optional(),
};
const windowOk = (m: { plannedStart?: string | null; plannedEnd?: string | null }) => !m.plannedStart || !m.plannedEnd || Date.parse(m.plannedEnd) > Date.parse(m.plannedStart);

export const CreateMissionRequest = z
  .object({ ...missionFields, status: z.enum(['draft', 'planned']).optional() })
  .refine(windowOk, { message: 'The end must be after the start', path: ['plannedEnd'] });
export type CreateMissionRequest = z.infer<typeof CreateMissionRequest>;
export const UpdateMissionRequest = z
  .object({ ...missionFields, name: missionFields.name.optional(), status: MissionStatus.optional() })
  .refine(windowOk, { message: 'The end must be after the start', path: ['plannedEnd'] });
export type UpdateMissionRequest = z.infer<typeof UpdateMissionRequest>;
export const MissionListResponse = z.object({ missions: z.array(MissionRecord) });
