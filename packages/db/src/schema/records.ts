import {
  bigint,
  boolean,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { entityColumns, orgIdColumn, ts } from './columns.js';

export const documents = pgTable(
  'documents',
  {
    ...entityColumns(),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
  },
  (t) => [index('documents_owner_idx').on(t.ownerType, t.ownerId)],
);

/**
 * Append-only audit log written exclusively by the `audit.log_change()` trigger.
 * The app role has SELECT only; UPDATE/DELETE are blocked by trigger even for the owner.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id'),
    at: ts('at').notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    requestId: text('request_id'),
    /** Database role that made the change — `certa_app` normally; anything else is a red flag. */
    dbRole: text('db_role').notNull(),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    operation: text('operation', { enum: ['INSERT', 'UPDATE', 'DELETE'] }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
  },
  (t) => [
    index('audit_events_org_at_idx').on(t.orgId, t.id),
    index('audit_events_row_idx').on(t.tableName, t.rowId),
  ],
);

/** Every read performed under an auditor membership. */
export const auditAccess = pgTable(
  'audit_access',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: orgIdColumn(),
    at: ts('at').notNull().defaultNow(),
    membershipId: uuid('membership_id').notNull(),
    userId: uuid('user_id').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestId: text('request_id'),
  },
  (t) => [index('audit_access_org_at_idx').on(t.orgId, t.at)],
);

/** Per-organization hash chain (Phase 5 fills it). Append-only, enforced by trigger. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    orgId: orgIdColumn(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    entityVersion: bigint('entity_version', { mode: 'number' }).notNull(),
    contentHash: text('content_hash').notNull(),
    prevHash: text('prev_hash').notNull(),
    entryHash: text('entry_hash').notNull(),
    at: ts('at').notNull(),
    actorUserId: uuid('actor_user_id'),
  },
  (t) => [
    uniqueIndex('ledger_entries_pk').on(t.orgId, t.seq),
    index('ledger_entries_entity_idx').on(t.entityType, t.entityId),
  ],
);

/** Signed checkpoints of each org's chain head (Phase 5). */
export const ledgerCheckpoints = pgTable('ledger_checkpoints', {
  id: uuid('id').primaryKey(),
  orgId: orgIdColumn(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  headHash: text('head_hash').notNull(),
  signature: text('signature').notNull(),
  keyId: text('key_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const exportsTable = pgTable('exports', {
  ...entityColumns(),
  kind: text('kind').notNull(),
  params: jsonb('params').notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  documentId: uuid('document_id'),
  verificationHash: text('verification_hash'),
  error: text('error'),
});

export const imports = pgTable('imports', {
  ...entityColumns(),
  status: text('status', { enum: ['uploading', 'parsing', 'review', 'committed', 'cancelled', 'failed'] })
    .notNull()
    .default('uploading'),
  summary: jsonb('summary'),
});

export const importItems = pgTable('import_items', {
  ...entityColumns(),
  importId: uuid('import_id')
    .notNull()
    .references(() => imports.id),
  documentId: uuid('document_id'),
  parser: text('parser'),
  status: text('status', { enum: ['pending', 'parsed', 'error', 'committed', 'skipped'] }).notNull(),
  result: jsonb('result'),
  duplicateOfFlightId: uuid('duplicate_of_flight_id'),
});

export const alertDeliveries = pgTable(
  'alert_deliveries',
  {
    id: uuid('id').primaryKey(),
    orgId: orgIdColumn(),
    itemKey: text('item_key').notNull(),
    dueOn: text('due_on'),
    thresholdDays: integer('threshold_days').notNull(),
    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('alert_deliveries_dedupe_uq').on(t.orgId, t.itemKey, t.dueOn, t.thresholdDays, t.channel, t.recipient),
  ],
);

export const apiKeys = pgTable('api_keys', {
  ...entityColumns(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull().unique(),
  secretHash: text('secret_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  lastUsedAt: ts('last_used_at'),
  expiresAt: ts('expires_at'),
});

export const webhookEndpoints = pgTable('webhook_endpoints', {
  ...entityColumns(),
  url: text('url').notNull(),
  kind: text('kind', { enum: ['generic', 'slack', 'discord'] }).notNull().default('generic'),
  events: jsonb('events').$type<string[]>().notNull(),
  secret: text('secret').notNull(),
  active: boolean('active').notNull().default(true),
});

/** Monotonic per-org change feed consumed by mobile pull (Phase 2). */
export const syncChanges = pgTable(
  'sync_changes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: orgIdColumn(),
    tableName: text('table_name').notNull(),
    rowId: uuid('row_id').notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    operation: text('operation', { enum: ['upsert', 'delete'] }).notNull(),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('sync_changes_org_id_idx').on(t.orgId, t.id)],
);

export const syncConflicts = pgTable('sync_conflicts', {
  ...entityColumns(),
  deviceId: text('device_id').notNull(),
  tableName: text('table_name').notNull(),
  rowId: uuid('row_id').notNull(),
  field: text('field').notNull(),
  localValue: jsonb('local_value'),
  serverValue: jsonb('server_value'),
  localChangedBy: uuid('local_changed_by'),
  localChangedAt: ts('local_changed_at'),
  resolvedAt: ts('resolved_at'),
  resolution: text('resolution', { enum: ['local', 'server'] }),
  resolutionNote: text('resolution_note'),
});
