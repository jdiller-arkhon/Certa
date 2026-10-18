import {
  addDays,
  dateInZone,
  type Aircraft,
  type Battery,
  type Credential,
  type ExternalFlight,
  type FleetSnapshot,
  type Flight,
  type GoNoGoResult,
  type InsurancePolicy,
  type MaintenanceSchedule,
  type MapContext,
  type Pilot,
  type PriorExperience,
  type TrainingRecord,
  type UnitsPreference,
  type WeatherSnapshot,
} from '@certa/core';
import {
  aircraft,
  and,
  batteries,
  credentials,
  desc,
  documents,
  eq,
  externalFlights,
  flightBatteries,
  flightObservers,
  flights,
  inArray,
  insuranceCoveredAircraft,
  insurancePolicies,
  isNull,
  maintenanceSchedules,
  organizations,
  pilots,
  priorExperience,
  sql,
  trainingRecords,
  type Db,
} from '@certa/db';
import { notFound } from './errors.js';
import { iso } from './mappers.js';
import { loadRuleInputs } from './rulepack.js';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

const base = (r: { id: string; orgId: string; createdAt: string; updatedAt: string; createdBy: string | null; deletedAt: string | null }) => ({
  id: r.id,
  orgId: r.orgId,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  createdBy: r.createdBy,
  deletedAt: iso(r.deletedAt),
});

export const toPilot = (r: Row<typeof pilots>): Pilot => ({
  ...base(r),
  membershipId: r.membershipId,
  displayName: r.displayName,
  email: r.email,
  phone: r.phone,
  certificateNumber: r.certificateNumber,
  active: r.active,
});

export const toCredential = (r: Row<typeof credentials>, documentIds: string[] = []): Credential => ({
  ...base(r),
  pilotId: r.pilotId,
  credentialType: r.credentialType,
  jurisdiction: r.jurisdiction as Credential['jurisdiction'],
  identifier: r.identifier,
  issuedOn: r.issuedOn,
  expiresOn: r.expiresOn,
  notes: r.notes,
  documentIds,
});

export const toTrainingRecord = (r: Row<typeof trainingRecords>): TrainingRecord => ({
  ...base(r),
  pilotId: r.pilotId,
  course: r.course,
  provider: r.provider,
  completedOn: r.completedOn,
  hours: r.hours,
});

export const toPriorExperience = (r: Row<typeof priorExperience>): PriorExperience => ({
  ...base(r),
  pilotId: r.pilotId,
  source: r.source,
  flights: r.flights,
  missions: r.missions,
  flightSeconds: r.flightSeconds,
  asOf: r.asOf,
  notes: r.notes,
});

export const toExternalFlight = (r: Row<typeof externalFlights>): ExternalFlight => ({
  ...base(r),
  pilotId: r.pilotId,
  source: r.source,
  externalId: r.externalId,
  reference: r.reference,
  takeoffAt: iso(r.takeoffAt)!,
  landingAt: iso(r.landingAt)!,
  durationSeconds: r.durationSeconds,
  locationName: r.locationName,
});

export const toAircraft = (r: Row<typeof aircraft>): Aircraft => ({
  ...base(r),
  nickname: r.nickname,
  make: r.make,
  model: r.model,
  serialNumber: r.serialNumber,
  registrationNumber: r.registrationNumber,
  registrationExpiresOn: r.registrationExpiresOn,
  remoteIdMethod: r.remoteIdMethod,
  remoteIdSerial: r.remoteIdSerial,
  takeoffMassKg: r.takeoffMassKg,
  firmwareVersion: r.firmwareVersion,
  status: r.status,
  groundedReason: r.groundedReason,
  totalFlightSeconds: r.totalFlightSeconds,
  totalFlights: r.totalFlights,
  modelDocumentId: r.modelDocumentId,
});

export const toBattery = (r: Row<typeof batteries>): Battery => ({
  ...base(r),
  serialNumber: r.serialNumber,
  label: r.label,
  chemistry: r.chemistry,
  cellCount: r.cellCount,
  ratedCapacityMah: r.ratedCapacityMah,
  cycleCount: r.cycleCount,
  status: r.status,
  aircraftModel: r.aircraftModel,
  purchasedOn: r.purchasedOn,
  thresholds: r.thresholds,
  notes: r.notes,
});

export const toInsurancePolicy = (r: Row<typeof insurancePolicies>, coveredAircraftIds: string[], documentIds: string[] = []): InsurancePolicy => ({
  ...base(r),
  carrier: r.carrier,
  policyNumber: r.policyNumber,
  coverageSummary: r.coverageSummary,
  liabilityLimitCents: r.liabilityLimitCents,
  effectiveOn: r.effectiveOn,
  expiresOn: r.expiresOn,
  coveredAircraftIds,
  documentIds,
});

export const toMaintenanceSchedule = (r: Row<typeof maintenanceSchedules>): MaintenanceSchedule => ({
  ...base(r),
  name: r.name,
  target: { type: r.targetType, id: r.targetId },
  everyFlightSeconds: r.everyFlightSeconds,
  everyFlights: r.everyFlights,
  everyDays: r.everyDays,
  lastDoneAt: iso(r.lastDoneAt),
  lastDoneFlightSeconds: r.lastDoneFlightSeconds,
  lastDoneFlights: r.lastDoneFlights,
  groundsWhenOverdue: r.groundsWhenOverdue,
});

// ---------------------------------------------------------------- flights

/** Flight columns plus decoded points (geography → lat/lon) and a has-path flag. */
export const flightSelection = {
  f: flights,
  takeoffLat: sql<number | null>`ST_Y(${flights.takeoffPoint}::geometry)`,
  takeoffLon: sql<number | null>`ST_X(${flights.takeoffPoint}::geometry)`,
  landingLat: sql<number | null>`ST_Y(${flights.landingPoint}::geometry)`,
  landingLon: sql<number | null>`ST_X(${flights.landingPoint}::geometry)`,
  hasPath: sql<boolean>`${flights.path} is not null`,
};
export type FlightSelectRow = { f: Row<typeof flights>; takeoffLat: number | null; takeoffLon: number | null; landingLat: number | null; landingLon: number | null; hasPath: boolean };

const point = (lat: number | null, lon: number | null) => (lat == null || lon == null ? null : { lat: Number(lat), lon: Number(lon), altMslM: null });

export async function toFlights(db: Db, rows: FlightSelectRow[]): Promise<(Flight & { goNoGo: GoNoGoResult | null })[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.f.id);
  // Sequential on purpose: these run on one transaction's connection.
  const obs = await db.select().from(flightObservers).where(inArray(flightObservers.flightId, ids));
  const bats = await db.select().from(flightBatteries).where(inArray(flightBatteries.flightId, ids));
  return rows.map(({ f, ...g }) => ({
    ...base(f),
    pilotInCommandId: f.pilotInCommandId,
    visualObserverIds: obs.filter((o) => o.flightId === f.id).map((o) => o.pilotId),
    aircraftId: f.aircraftId,
    batteries: bats.filter((b) => b.flightId === f.id).map((b) => ({ batteryId: b.batteryId, startPct: b.startPct, endPct: b.endPct })),
    takeoffAt: iso(f.takeoffAt),
    landingAt: iso(f.landingAt),
    localTimeZone: f.localTimeZone,
    takeoffPoint: point(g.takeoffLat, g.takeoffLon),
    landingPoint: point(g.landingLat, g.landingLon),
    locationName: f.locationName,
    durationSeconds: f.durationSeconds,
    maxAltitudeAglM: f.maxAltitudeAglM,
    maxDistanceM: f.maxDistanceM,
    totalDistanceM: f.totalDistanceM,
    hasPath: !!g.hasPath,
    weather: (f.weather as WeatherSnapshot | null) ?? null,
    airspaceClass: (f.airspaceClass as Flight['airspaceClass']) ?? null,
    authorizationId: f.authorizationId,
    missionId: f.missionId,
    siteId: f.siteId,
    operationType: f.operationType as Flight['operationType'],
    notes: f.notes,
    source: f.source,
    importParser: f.importParser,
    rawLogDocumentId: f.rawLogDocumentId,
    goNoGo: (f.goNoGo as GoNoGoResult | null) ?? null,
  }));
}

/**
 * Aircraft hours/flights and battery cycle counts are derived from flights and never written by
 * clients. Recomputed in the same transaction as any flight change.
 */
export async function recomputeDerived(db: Db, ids: { aircraftIds: string[]; batteryIds: string[] }) {
  const aircraftIds = [...new Set(ids.aircraftIds)];
  const batteryIds = [...new Set(ids.batteryIds)];
  if (aircraftIds.length)
    await db.execute(sql`
      update aircraft a set
        total_flights = coalesce(t.n, 0),
        total_flight_seconds = coalesce(t.s, 0)
      from (select x.id, count(f.id) as n, sum(f.duration_seconds) as s
              from aircraft x left join flights f on f.aircraft_id = x.id and f.deleted_at is null
             where x.id in (${sql.join(aircraftIds.map((i) => sql`${i}::uuid`), sql`, `)})
             group by x.id) t
      where a.id = t.id and (a.total_flights is distinct from coalesce(t.n, 0) or a.total_flight_seconds is distinct from coalesce(t.s, 0))`);
  if (batteryIds.length)
    await db.execute(sql`
      update batteries b set cycle_count = coalesce(t.n, 0)
      from (select x.id, count(f.id) as n
              from batteries x
              left join flight_batteries fb on fb.battery_id = x.id
              left join flights f on f.id = fb.flight_id and f.deleted_at is null
             where x.id in (${sql.join(batteryIds.map((i) => sql`${i}::uuid`), sql`, `)})
             group by x.id) t
      where b.id = t.id and b.cycle_count is distinct from coalesce(t.n, 0)`);
}

// ---------------------------------------------------------------- snapshot

export async function orgMapContext(db: Db, orgId: string, now = new Date()): Promise<MapContext & { org: Row<typeof organizations> }> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound('Organization');
  return { org, today: dateInZone(now, org.timezone), now, units: org.units as UnitsPreference, orgTimeZone: org.timezone };
}

/**
 * Per-pilot totals: Certa flights plus Argus mission flights not yet turned into Certa flights
 * (each Argus job also counts as a mission).
 */
function pilotTotalsWithExternal(
  totals: { pilotId: string; n: number; s: number | string; last: string | null; n90: number; missions: number }[],
  external: Row<typeof externalFlights>[],
  since90: string,
): FleetSnapshot['pilotTotals'] {
  const out: FleetSnapshot['pilotTotals'] = {};
  for (const t of totals) out[t.pilotId] = { flights: t.n, flightSeconds: Number(t.s), lastFlightAt: iso(t.last), last90DaysFlights: t.n90, missions: t.missions };
  const since = new Date(since90).getTime();
  for (const e of external) {
    const t = (out[e.pilotId] ??= { flights: 0, flightSeconds: 0, lastFlightAt: null, last90DaysFlights: 0, missions: 0 });
    const at = iso(e.takeoffAt)!;
    t.flights += 1;
    t.missions += 1;
    t.flightSeconds += e.durationSeconds;
    if (new Date(at).getTime() >= since) t.last90DaysFlights += 1;
    if (!t.lastFlightAt || at > t.lastFlightAt) t.lastFlightAt = at;
  }
  return out;
}

export async function loadFleet(db: Db, orgId: string, now = new Date()): Promise<FleetSnapshot> {
  const ctx = await orgMapContext(db, orgId, now);
  const org = ctx.org;
  const rules = await loadRuleInputs(db, org.defaultJurisdiction);
  if (!rules) throw notFound(`Rule pack for ${org.defaultJurisdiction}`);
  const since90 = `${addDays(ctx.today, -90)}T00:00:00Z`;

  // Sequential on purpose: one transaction, one connection.
  const q = [
    db.select().from(pilots).where(isNull(pilots.deletedAt)).orderBy(pilots.displayName),
    db.select().from(credentials).where(isNull(credentials.deletedAt)),
    db.select({ ownerType: documents.ownerType, ownerId: documents.ownerId, id: documents.id }).from(documents).where(and(isNull(documents.deletedAt), inArray(documents.ownerType, ['credential', 'insurance_policy']))),
    db.select().from(aircraft).where(isNull(aircraft.deletedAt)).orderBy(aircraft.createdAt),
    db.select().from(batteries).where(isNull(batteries.deletedAt)).orderBy(batteries.serialNumber),
    db.select().from(insurancePolicies).where(isNull(insurancePolicies.deletedAt)),
    db.select().from(insuranceCoveredAircraft),
    db.select().from(maintenanceSchedules).where(isNull(maintenanceSchedules.deletedAt)),
    db
      .select({
        pilotId: flights.pilotInCommandId,
        n: sql<number>`count(*)::int`,
        s: sql<number>`coalesce(sum(${flights.durationSeconds}), 0)::bigint`,
        last: sql<string | null>`max(${flights.takeoffAt})`,
        n90: sql<number>`(count(*) filter (where ${flights.takeoffAt} >= ${since90}))::int`,
        missions: sql<number>`count(distinct ${flights.missionId})::int`,
      })
      .from(flights)
      .where(isNull(flights.deletedAt))
      .groupBy(flights.pilotInCommandId),
    db
      .select({ batteryId: flightBatteries.batteryId, last: sql<string | null>`max(${flights.takeoffAt})` })
      .from(flightBatteries)
      .innerJoin(flights, and(eq(flights.id, flightBatteries.flightId), isNull(flights.deletedAt)))
      .groupBy(flightBatteries.batteryId),
    db.select(flightSelection).from(flights).where(isNull(flights.deletedAt)).orderBy(desc(flights.takeoffAt)).limit(1),
    db
      .select({ name: flights.locationName, last: sql<string>`max(${flights.takeoffAt})` })
      .from(flights)
      .where(and(isNull(flights.deletedAt), sql`${flights.locationName} is not null`))
      .groupBy(flights.locationName)
      .orderBy(sql`max(${flights.takeoffAt}) desc`)
      .limit(8),
    db
      .select({
        last7: sql<number>`(count(*) filter (where ${flights.takeoffAt} >= ${new Date(now.getTime() - 7 * 86400_000).toISOString()}))::int`,
        last30: sql<number>`(count(*) filter (where ${flights.takeoffAt} >= ${new Date(now.getTime() - 30 * 86400_000).toISOString()}))::int`,
      })
      .from(flights)
      .where(isNull(flights.deletedAt)),
    db.select().from(priorExperience).where(isNull(priorExperience.deletedAt)).orderBy(desc(priorExperience.asOf)),
    db.select().from(externalFlights).where(and(isNull(externalFlights.deletedAt), isNull(externalFlights.convertedFlightId))).orderBy(desc(externalFlights.takeoffAt)),
  ] as const;
  const results: unknown[] = [];
  for (const query of q) results.push(await query);
  const [pilotRows, credRows, docRows, acRows, batRows, polRows, coverRows, schedRows, totals, lastUsed, lastFlightRows, locations, recentCounts, priorRows, externalRows] = results as unknown as { [K in keyof typeof q]: Awaited<(typeof q)[K]> };

  const docsOf = (type: string, id: string) => docRows.filter((d) => d.ownerType === type && d.ownerId === id).map((d) => d.id);
  const [lastFlight] = await toFlights(db, lastFlightRows as FlightSelectRow[]);

  return {
    organization: { id: org.id, name: org.name, timezone: org.timezone, units: ctx.units, defaultJurisdiction: org.defaultJurisdiction as FleetSnapshot['organization']['defaultJurisdiction'] },
    rulePack: rules.pack,
    overrides: rules.overrides,
    pilots: pilotRows.map(toPilot),
    credentials: credRows.map((c) => toCredential(c, docsOf('credential', c.id))),
    priorExperience: priorRows.map(toPriorExperience),
    aircraft: acRows.map(toAircraft),
    batteries: batRows.map(toBattery),
    insurancePolicies: polRows.map((p) => toInsurancePolicy(p, coverRows.filter((c) => c.policyId === p.id).map((c) => c.aircraftId), docsOf('insurance_policy', p.id))),
    maintenanceSchedules: schedRows.map(toMaintenanceSchedule),
    pilotTotals: pilotTotalsWithExternal(totals, externalRows, since90),
    externalFlights: externalRows.map(toExternalFlight),
    batteryLastUsed: Object.fromEntries(lastUsed.map((b) => [b.batteryId, iso(b.last)])),
    lastFlight: lastFlight ? (({ goNoGo: _g, ...f }) => f)(lastFlight) : null,
    recentLocations: locations.map((l) => l.name!).filter(Boolean),
    recentFlightCounts: { last7: recentCounts[0]?.last7 ?? 0, last30: recentCounts[0]?.last30 ?? 0 },
    generatedAt: now.toISOString(),
  };
}
