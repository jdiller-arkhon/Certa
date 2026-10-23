import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';
import { ts } from './columns.js';
import { organizations } from './tenancy.js';

/** Platform-wide notices from Arkhon admins, shown in the app and optionally emailed / pushed. */
export const platformAnnouncements = pgTable(
  'platform_announcements',
  {
    id: uuid('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    audience: text('audience', { enum: ['everyone', 'pilots', 'managers'] }).notNull(),
    level: text('level', { enum: ['info', 'important'] }).notNull().default('info'),
    emailed: integer('emailed').notNull().default(0),
    pushed: integer('pushed').notNull().default(0),
    startsAt: ts('starts_at').notNull().defaultNow(),
    endsAt: ts('ends_at'),
    createdBy: uuid('created_by').references(() => authUsers.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('platform_announcements_active_idx').on(t.startsAt, t.endsAt)],
);

/** Append-only log of platform-admin actions (reminders, invites, exports, announcements). */
export const platformAdminEvents = pgTable(
  'platform_admin_events',
  {
    id: uuid('id').primaryKey(),
    at: ts('at').notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    orgId: uuid('org_id').references(() => organizations.id),
    target: text('target'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
  },
  (t) => [index('platform_admin_events_at_idx').on(t.at)],
);
