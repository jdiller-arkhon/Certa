import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { entityColumns, orgIdColumn, ts } from './columns.js';
import { aircraft } from './fleet.js';
import { flights } from './operations.js';
import { pilots } from './tenancy.js';

/** Controllers/docks linked from DJI Pilot 2, and the aircraft seen on them (migration 0013). */
export const liveDevices = pgTable(
  'live_devices',
  {
    ...entityColumns(),
    sn: text('sn').notNull(),
    kind: text('kind', { enum: ['gateway', 'aircraft'] }).notNull(),
    model: text('model'),
    gatewaySn: text('gateway_sn'),
    /** The pilot who linked the controller: pilot in command of flights it streams. */
    pilotId: uuid('pilot_id').references(() => pilots.id),
    mqttPrefix: text('mqtt_prefix').unique(),
    secretHash: text('secret_hash'),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [uniqueIndex('live_devices_sn_uq').on(t.sn).where(sql`deleted_at is null`), index('live_devices_org_idx').on(t.orgId).where(sql`deleted_at is null`)],
);

export const liveSessions = pgTable(
  'live_sessions',
  {
    id: uuid('id').primaryKey(),
    orgId: orgIdColumn(),
    aircraftSn: text('aircraft_sn').notNull(),
    gatewaySn: text('gateway_sn'),
    model: text('model'),
    aircraftId: uuid('aircraft_id').references(() => aircraft.id),
    pilotId: uuid('pilot_id').references(() => pilots.id),
    status: text('status', { enum: ['open', 'logged', 'needs_aircraft', 'discarded'] }).notNull().default('open'),
    startedAt: ts('started_at').notNull(),
    lastFrameAt: ts('last_frame_at').notNull(),
    lastAirborneAt: ts('last_airborne_at').notNull(),
    endedAt: ts('ended_at'),
    timedOut: boolean('timed_out').notNull().default(false),
    lastFrame: jsonb('last_frame'),
    events: jsonb('events').notNull().default(sql`'[]'::jsonb`),
    flightId: uuid('flight_id').references(() => flights.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('live_sessions_open_uq').on(t.aircraftSn).where(sql`status = 'open'`), index('live_sessions_org_idx').on(t.orgId, t.startedAt)],
);

export const liveSamples = pgTable(
  'live_samples',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => liveSessions.id, { onDelete: 'cascade' }),
    orgId: orgIdColumn(),
    t: ts('t').notNull(),
    frame: jsonb('frame').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.t] })],
);
