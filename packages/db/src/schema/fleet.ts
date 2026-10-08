import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BatteryRetirementThresholds } from '@certa/core';
import { entityColumns, ts } from './columns.js';

export const aircraft = pgTable(
  'aircraft',
  {
    ...entityColumns(),
    nickname: text('nickname'),
    make: text('make').notNull(),
    model: text('model').notNull(),
    serialNumber: text('serial_number').notNull(),
    registrationNumber: text('registration_number'),
    registrationExpiresOn: date('registration_expires_on', { mode: 'string' }),
    remoteIdMethod: text('remote_id_method', {
      enum: ['standard', 'broadcast_module', 'fria', 'none'],
    })
      .notNull()
      .default('standard'),
    remoteIdSerial: text('remote_id_serial'),
    takeoffMassKg: numeric('takeoff_mass_kg', { precision: 10, scale: 4, mode: 'number' }),
    firmwareVersion: text('firmware_version'),
    status: text('status', { enum: ['active', 'grounded', 'retired'] }).notNull().default('active'),
    groundedReason: text('grounded_reason'),
    /** Derived server-side from flights; never written by clients. */
    totalFlightSeconds: bigint('total_flight_seconds', { mode: 'number' }).notNull().default(0),
    totalFlights: integer('total_flights').notNull().default(0),
  },
  (t) => [
    uniqueIndex('aircraft_org_serial_uq')
      .on(t.orgId, t.make, t.serialNumber)
      .where(sql`deleted_at is null`),
  ],
);

export const aircraftFirmwareHistory = pgTable('aircraft_firmware_history', {
  ...entityColumns(),
  aircraftId: uuid('aircraft_id')
    .notNull()
    .references(() => aircraft.id),
  firmwareVersion: text('firmware_version').notNull(),
  installedAt: ts('installed_at').notNull(),
  notes: text('notes'),
});

export const components = pgTable(
  'components',
  {
    ...entityColumns(),
    kind: text('kind', { enum: ['motor', 'propeller', 'gimbal', 'payload', 'sensor', 'other'] }).notNull(),
    name: text('name').notNull(),
    serialNumber: text('serial_number'),
    aircraftId: uuid('aircraft_id').references(() => aircraft.id),
    flightSeconds: bigint('flight_seconds', { mode: 'number' }).notNull().default(0),
    cycles: integer('cycles').notNull().default(0),
    limitFlightSeconds: bigint('limit_flight_seconds', { mode: 'number' }),
    limitCycles: integer('limit_cycles'),
    installedAt: ts('installed_at'),
  },
  (t) => [index('components_aircraft_idx').on(t.aircraftId)],
);

export const componentInstallations = pgTable('component_installations', {
  ...entityColumns(),
  componentId: uuid('component_id')
    .notNull()
    .references(() => components.id),
  aircraftId: uuid('aircraft_id')
    .notNull()
    .references(() => aircraft.id),
  installedAt: ts('installed_at').notNull(),
  removedAt: ts('removed_at'),
  reason: text('reason'),
});

export const batteries = pgTable(
  'batteries',
  {
    ...entityColumns(),
    serialNumber: text('serial_number').notNull(),
    label: text('label'),
    chemistry: text('chemistry', { enum: ['lipo', 'lihv', 'liion', 'other'] }).notNull().default('lipo'),
    cellCount: integer('cell_count'),
    ratedCapacityMah: integer('rated_capacity_mah'),
    /** Derived server-side from flight_batteries; never synced as a value. */
    cycleCount: integer('cycle_count').notNull().default(0),
    status: text('status', { enum: ['active', 'watch', 'retired'] }).notNull().default('active'),
    aircraftModel: text('aircraft_model'),
    purchasedOn: date('purchased_on', { mode: 'string' }),
    thresholds: jsonb('thresholds')
      .$type<BatteryRetirementThresholds>()
      .notNull()
      .default({ maxCycles: null, minCapacityPct: null, maxCellDeviationMv: null, maxAgeDays: null }),
    notes: text('notes'),
  },
  (t) => [
    uniqueIndex('batteries_org_serial_uq').on(t.orgId, t.serialNumber).where(sql`deleted_at is null`),
  ],
);

export const batteryReadings = pgTable('battery_readings', {
  ...entityColumns(),
  batteryId: uuid('battery_id')
    .notNull()
    .references(() => batteries.id),
  measuredAt: ts('measured_at').notNull(),
  capacityPct: numeric('capacity_pct', { precision: 5, scale: 2, mode: 'number' }),
  internalResistanceMohm: numeric('internal_resistance_mohm', { precision: 8, scale: 2, mode: 'number' }),
  cellDeviationMv: numeric('cell_deviation_mv', { precision: 8, scale: 2, mode: 'number' }),
  note: text('note'),
});

export const maintenanceSchedules = pgTable('maintenance_schedules', {
  ...entityColumns(),
  name: text('name').notNull(),
  targetType: text('target_type', { enum: ['aircraft', 'component', 'battery'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  everyFlightSeconds: bigint('every_flight_seconds', { mode: 'number' }),
  everyFlights: integer('every_flights'),
  everyDays: integer('every_days'),
  lastDoneAt: ts('last_done_at'),
  lastDoneFlightSeconds: bigint('last_done_flight_seconds', { mode: 'number' }),
  lastDoneFlights: integer('last_done_flights'),
  groundsWhenOverdue: boolean('grounds_when_overdue').notNull().default(true),
});

export const maintenanceEvents = pgTable('maintenance_events', {
  ...entityColumns(),
  kind: text('kind', { enum: ['scheduled', 'unscheduled'] }).notNull(),
  scheduleId: uuid('schedule_id').references(() => maintenanceSchedules.id),
  targetType: text('target_type', { enum: ['aircraft', 'component', 'battery'] }).notNull(),
  targetId: uuid('target_id').notNull(),
  performedAt: ts('performed_at').notNull(),
  performedBy: text('performed_by').notNull(),
  description: text('description').notNull(),
  partsReplaced: jsonb('parts_replaced')
    .$type<{ name: string; serialNumber: string | null }[]>()
    .notNull()
    .default([]),
  flightSecondsAtService: bigint('flight_seconds_at_service', { mode: 'number' }),
  signedOffByUserId: uuid('signed_off_by_user_id'),
  signedOffAt: ts('signed_off_at'),
});
