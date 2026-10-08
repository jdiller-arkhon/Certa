import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ChecklistRun, ChecklistTemplate, IncidentFacts, WeatherSnapshot } from '@certa/core';
import { entityColumns, geography, orgIdColumn, ts } from './columns.js';
import { aircraft, batteries } from './fleet.js';
import { pilots } from './tenancy.js';

export const clients = pgTable('clients', {
  ...entityColumns(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  notes: text('notes'),
});

export const sites = pgTable('sites', {
  ...entityColumns(),
  clientId: uuid('client_id').references(() => clients.id),
  name: text('name').notNull(),
  address: text('address'),
  location: geography('location', 'Point'),
  boundary: geography('boundary', 'Polygon'),
  notes: text('notes'),
});

export const authorizations = pgTable('authorizations', {
  ...entityColumns(),
  kind: text('kind', { enum: ['laanc', 'airspace_authorization', 'waiver', 'coa', 'other'] }).notNull(),
  reference: text('reference').notNull(),
  title: text('title'),
  scope: text('scope'),
  conditions: text('conditions'),
  validFrom: ts('valid_from'),
  validTo: ts('valid_to'),
  geometry: geography('geometry', 'Geometry'),
  pilotId: uuid('pilot_id').references(() => pilots.id),
});

export const missions = pgTable('missions', {
  ...entityColumns(),
  name: text('name').notNull(),
  clientId: uuid('client_id').references(() => clients.id),
  siteId: uuid('site_id').references(() => sites.id),
  purpose: text('purpose'),
  plannedStart: ts('planned_start'),
  plannedEnd: ts('planned_end'),
  status: text('status', { enum: ['draft', 'planned', 'in_progress', 'completed', 'cancelled'] })
    .notNull()
    .default('draft'),
  deliverables: text('deliverables'),
});

export const missionCrew = pgTable(
  'mission_crew',
  {
    orgId: orgIdColumn(),
    missionId: uuid('mission_id').notNull().references(() => missions.id),
    pilotId: uuid('pilot_id').notNull().references(() => pilots.id),
    role: text('role').notNull().default('pic'),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.pilotId] })],
);

export const missionAircraft = pgTable(
  'mission_aircraft',
  {
    orgId: orgIdColumn(),
    missionId: uuid('mission_id').notNull().references(() => missions.id),
    aircraftId: uuid('aircraft_id').notNull().references(() => aircraft.id),
    overrideReason: text('override_reason'),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.aircraftId] })],
);

export const missionAuthorizations = pgTable(
  'mission_authorizations',
  {
    orgId: orgIdColumn(),
    missionId: uuid('mission_id').notNull().references(() => missions.id),
    authorizationId: uuid('authorization_id').notNull().references(() => authorizations.id),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.authorizationId] })],
);

export const flights = pgTable(
  'flights',
  {
    ...entityColumns(),
    pilotInCommandId: uuid('pilot_in_command_id')
      .notNull()
      .references(() => pilots.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    takeoffAt: ts('takeoff_at').notNull(),
    landingAt: ts('landing_at').notNull(),
    localTimeZone: text('local_time_zone').notNull(),
    takeoffPoint: geography('takeoff_point', 'Point'),
    landingPoint: geography('landing_point', 'Point'),
    /** Z = altitude (m, MSL), M = epoch seconds. */
    path: geography('path', 'LineStringZM'),
    locationName: text('location_name'),
    place: jsonb('place'),
    durationSeconds: integer('duration_seconds').notNull(),
    maxAltitudeAglM: numeric('max_altitude_agl_m', { precision: 10, scale: 2, mode: 'number' }),
    maxDistanceM: numeric('max_distance_m', { precision: 12, scale: 2, mode: 'number' }),
    totalDistanceM: numeric('total_distance_m', { precision: 12, scale: 2, mode: 'number' }),
    weather: jsonb('weather').$type<WeatherSnapshot>(),
    airspaceClass: text('airspace_class'),
    authorizationId: uuid('authorization_id').references(() => authorizations.id),
    missionId: uuid('mission_id').references(() => missions.id),
    siteId: uuid('site_id').references(() => sites.id),
    operationType: text('operation_type').notNull().default('commercial'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'import'] }).notNull().default('manual'),
    importParser: text('import_parser'),
    importConfidence: numeric('import_confidence', { precision: 4, scale: 3, mode: 'number' }),
    importWarnings: jsonb('import_warnings').$type<string[]>(),
    rawLogDocumentId: uuid('raw_log_document_id'),
    /** Dedupe key for imports: aircraft serial + takeoff time bucket. */
    dedupeKey: text('dedupe_key'),
  },
  (t) => [
    index('flights_org_takeoff_idx').on(t.orgId, t.takeoffAt),
    index('flights_pilot_idx').on(t.pilotInCommandId, t.takeoffAt),
    index('flights_aircraft_idx').on(t.aircraftId, t.takeoffAt),
    index('flights_dedupe_idx').on(t.orgId, t.dedupeKey),
  ],
);

export const flightObservers = pgTable(
  'flight_observers',
  {
    orgId: orgIdColumn(),
    flightId: uuid('flight_id').notNull().references(() => flights.id),
    pilotId: uuid('pilot_id').notNull().references(() => pilots.id),
  },
  (t) => [primaryKey({ columns: [t.flightId, t.pilotId] })],
);

export const flightBatteries = pgTable(
  'flight_batteries',
  {
    orgId: orgIdColumn(),
    flightId: uuid('flight_id').notNull().references(() => flights.id),
    batteryId: uuid('battery_id').notNull().references(() => batteries.id),
    startPct: numeric('start_pct', { precision: 5, scale: 2, mode: 'number' }),
    endPct: numeric('end_pct', { precision: 5, scale: 2, mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.flightId, t.batteryId] }), index('flight_batteries_battery_idx').on(t.batteryId)],
);

export const checklistTemplates = pgTable('checklist_templates', {
  ...entityColumns(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['preflight', 'postflight', 'emergency', 'other'] }).notNull(),
  templateVersion: integer('template_version').notNull().default(1),
  isDefault: boolean('is_default').notNull().default(false),
  sections: jsonb('sections').$type<ChecklistTemplate['sections']>().notNull(),
});

export const checklistRuns = pgTable('checklist_runs', {
  ...entityColumns(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => checklistTemplates.id),
  templateVersion: integer('template_version').notNull(),
  flightId: uuid('flight_id').references(() => flights.id),
  startedAt: ts('started_at').notNull(),
  completedAt: ts('completed_at'),
  location: geography('location', 'Point'),
  responses: jsonb('responses').$type<ChecklistRun['responses']>().notNull().default([]),
  signedByPilotId: uuid('signed_by_pilot_id').references(() => pilots.id),
  signedAt: ts('signed_at'),
});

export const incidents = pgTable('incidents', {
  ...entityColumns(),
  type: text('type', { enum: ['damage', 'injury', 'flyaway', 'near_miss', 'loss_of_link', 'other'] }).notNull(),
  severity: text('severity', { enum: ['minor', 'moderate', 'serious', 'critical'] }).notNull(),
  status: text('status', { enum: ['open', 'investigating', 'corrective_action', 'closed'] })
    .notNull()
    .default('open'),
  occurredAt: ts('occurred_at').notNull(),
  location: geography('location', 'Point'),
  aircraftId: uuid('aircraft_id').references(() => aircraft.id),
  pilotId: uuid('pilot_id').references(() => pilots.id),
  flightId: uuid('flight_id').references(() => flights.id),
  summary: text('summary').notNull(),
  narrative: text('narrative'),
  facts: jsonb('facts').$type<IncidentFacts>().notNull(),
  /** Snapshot of the rule-pack determination at the time it was computed. */
  reportability: jsonb('reportability'),
  reportedToRegulatorAt: ts('reported_to_regulator_at'),
  regulatorReference: text('regulator_reference'),
});

export const correctiveActions = pgTable('corrective_actions', {
  ...entityColumns(),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id),
  description: text('description').notNull(),
  ownerUserId: uuid('owner_user_id'),
  dueOn: date('due_on', { mode: 'string' }),
  closedAt: ts('closed_at'),
});

export const insurancePolicies = pgTable('insurance_policies', {
  ...entityColumns(),
  carrier: text('carrier').notNull(),
  policyNumber: text('policy_number').notNull(),
  coverageSummary: text('coverage_summary'),
  liabilityLimitCents: bigint('liability_limit_cents', { mode: 'number' }),
  effectiveOn: date('effective_on', { mode: 'string' }).notNull(),
  expiresOn: date('expires_on', { mode: 'string' }).notNull(),
});

export const insuranceCoveredAircraft = pgTable(
  'insurance_covered_aircraft',
  {
    orgId: orgIdColumn(),
    policyId: uuid('policy_id').notNull().references(() => insurancePolicies.id),
    aircraftId: uuid('aircraft_id').notNull().references(() => aircraft.id),
  },
  (t) => [primaryKey({ columns: [t.policyId, t.aircraftId] })],
);
