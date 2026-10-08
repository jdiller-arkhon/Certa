/**
 * Request/response schemas for the REST API. The Fastify routes use these directly, so the
 * OpenAPI document in contract/openapi.yaml is generated from exactly this code.
 */
import { z } from 'zod';
import { AuditEvent, Id, IsoDateTime, Membership, Organization, User } from '../domain/entities.js';
import { JurisdictionId, PlanTier, Role, UnitsPreference } from '../domain/enums.js';
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
