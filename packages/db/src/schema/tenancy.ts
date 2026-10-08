import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AuditorScope, UnitsPreference } from '@certa/core';
import { authUsers } from './auth.js';
import { entityColumns, ts } from './columns.js';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  planTier: text('plan_tier', { enum: ['solo', 'team', 'enterprise', 'self_hosted'] })
    .notNull()
    .default('solo'),
  defaultJurisdiction: text('default_jurisdiction').notNull().default('US-FAA-Part107'),
  timezone: text('timezone').notNull(),
  units: jsonb('units').$type<UnitsPreference>().notNull(),
  /** Readiness / alert policy: amber window and alert thresholds in days. */
  alertPolicy: jsonb('alert_policy')
    .$type<{ amberWithinDays: number; alertThresholdsDays: number[] }>()
    .notNull()
    .default({ amberWithinDays: 30, alertThresholdsDays: [90, 30, 7] }),
  branding: jsonb('branding').$type<{ logoDocumentId?: string; primaryColor?: string }>(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  deletedAt: ts('deleted_at'),
  version: bigint('version', { mode: 'number' }).notNull().default(1),
});

export const memberships = pgTable(
  'memberships',
  {
    ...entityColumns(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: text('role', {
      enum: ['owner', 'admin', 'chief_pilot', 'pilot', 'maintenance_tech', 'viewer', 'auditor'],
    }).notNull(),
    expiresAt: ts('expires_at'),
    auditorScope: jsonb('auditor_scope').$type<AuditorScope>(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_uq').on(t.orgId, t.userId).where(sql`deleted_at is null`),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const pilots = pgTable(
  'pilots',
  {
    ...entityColumns(),
    membershipId: uuid('membership_id').references(() => memberships.id),
    displayName: text('display_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    certificateNumber: text('certificate_number'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    index('pilots_org_idx').on(t.orgId),
    uniqueIndex('pilots_membership_uq').on(t.membershipId).where(sql`membership_id is not null and deleted_at is null`),
  ],
);

export const credentials = pgTable(
  'credentials',
  {
    ...entityColumns(),
    pilotId: uuid('pilot_id')
      .notNull()
      .references(() => pilots.id),
    credentialType: text('credential_type').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    identifier: text('identifier'),
    issuedOn: date('issued_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    notes: text('notes'),
  },
  (t) => [index('credentials_pilot_idx').on(t.pilotId)],
);

export const trainingRecords = pgTable('training_records', {
  ...entityColumns(),
  pilotId: uuid('pilot_id')
    .notNull()
    .references(() => pilots.id),
  course: text('course').notNull(),
  provider: text('provider'),
  completedOn: date('completed_on', { mode: 'string' }).notNull(),
  hours: numeric('hours', { precision: 8, scale: 2, mode: 'number' }),
});

// ---------------------------------------------------------------- rule packs (global)

export const rulePacks = pgTable(
  'rule_packs',
  {
    id: uuid('id').primaryKey(),
    jurisdiction: text('jurisdiction').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    authority: text('authority').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    disclaimer: text('disclaimer').notNull(),
    /** The full validated pack document, exactly as shipped. */
    document: jsonb('document').notNull(),
    contentHash: text('content_hash').notNull(),
    active: boolean('active').notNull().default(true),
    loadedAt: ts('loaded_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rule_packs_jurisdiction_version_uq').on(t.jurisdiction, t.version)],
);

export const orgRuleOverrides = pgTable(
  'org_rule_overrides',
  {
    ...entityColumns(),
    jurisdiction: text('jurisdiction').notNull(),
    ruleId: text('rule_id').notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    uniqueIndex('org_rule_overrides_uq')
      .on(t.orgId, t.jurisdiction, t.ruleId)
      .where(sql`deleted_at is null`),
  ],
);
