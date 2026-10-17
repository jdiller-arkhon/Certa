/**
 * Generates contract/fixtures/*.ts from realistic domain data using the same @certa/core mappers
 * the real containers use. Deterministic (seeded PRNG, fixed "today"), so output is stable and
 * CI can check it is up to date: `pnpm --filter @certa/contract gen:fixtures --check`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_PREFLIGHT_SECTIONS,
  buildAircraftDetail,
  buildChecklistsAdmin,
  buildAuthorizations,
  buildMissions,
  buildMissionDetail,
  buildMissionForm,
  buildAircraftList,
  buildBatteryList,
  buildFlightDetail,
  buildFlightList,
  buildInsurance,
  buildLogFlight,
  buildMaintenance,
  goNoGo,
  buildPilotDetail,
  buildPilotList,
  buildReadinessDashboard,
  aircraftName,
  aircraftReadiness,
  badgeFromSummary,
  buildShell,
  can,
  DEFAULT_UNITS_US,
  displayDate,
  displayInstant,
  formatDuration,
  formatLength,
  formatMass,
  pilotReadiness,
  reasonFromItem,
  resolveRulePack,
  ROLE_LABELS,
  ROLES,
  summarize,
  toAircraftReadinessRow,
  toAircraftRow,
  toAuditEventViewModel,
  toBatteryRow,
  toCredentialViewModel,
  toFlightRow,
  toMemberRow,
  toPilotReadinessRow,
  toPilotRow,
  toRuleRow,
  userChip,
  type Aircraft,
  type AuditEvent,
  type Battery,
  type Credential,
  type FleetSnapshot,
  type BuildInput,
  type InsurancePolicy,
  type MaintenanceEvent,
  type MaintenanceSchedule,
  type Flight,
  type MapContext,
  type Pilot,
  type ReadinessSummary,
  type ResolvedRulePack,
  type Role,
  type SyncStateViewModel,
} from '@certa/core';
import { latestPack } from '@certa/rulepacks';
import type { AuthFixtures, FixtureScenario } from '../fixtures/scenario.ts';


/** Fixed authorizations relative to NOW: a current waiver, an expiring COA, today's LAANC, an expired one. */
function sampleAuthorizations(pilotId: string | null) {
  const base = { orgId: '00000000-0000-7000-8000-000000000001', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), createdBy: null, deletedAt: null, scope: null };
  const at = (days: number) => new Date(NOW.getTime() + days * 86400_000).toISOString();
  return [
    { ...base, id: '00000000-0000-7000-8000-0000000a0001', kind: 'waiver' as const, reference: '107W-2026-01234', title: 'Operations over people (107.39)', conditions: 'Category 2 aircraft only; visual observer required.', validFrom: at(-200), validTo: at(530), pilotId: null },
    { ...base, id: '00000000-0000-7000-8000-0000000a0002', kind: 'coa' as const, reference: '2026-WSA-412-COA', title: 'Henderson substation corridor', conditions: null, validFrom: at(-340), validTo: at(18), pilotId: null },
    { ...base, id: '00000000-0000-7000-8000-0000000a0003', kind: 'laanc' as const, reference: 'LAANC-7F3K2Q', title: 'Centennial Class D, 200 ft', conditions: null, validFrom: at(-0.05), validTo: at(0.2), pilotId },
    { ...base, id: '00000000-0000-7000-8000-0000000a0004', kind: 'airspace_authorization' as const, reference: 'FAA-AA-2025-0988', title: 'Denver Class B surface area', conditions: null, validFrom: at(-400), validTo: at(-35), pilotId },
  ];
}

/** Missions relative to NOW: one next week, one under way today, one completed, one undated draft. */
function sampleMissions(w: World) {
  const base = { orgId: '00000000-0000-7000-8000-000000000001', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), createdBy: null, deletedAt: null, deliverables: null, flightCount: 0, flightSeconds: 0 };
  const at = (days: number, hour: number) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + days, hour)).toISOString();
  const [p0, p1] = w.pilots;
  const [a0, a1] = w.aircraft;
  if (!p0 || !a0) return [];
  const auths = sampleAuthorizations(p0.id);
  const crew = (observer: boolean) => [{ pilotId: p0.id, role: 'pic' as const }, ...(observer && p1 ? [{ pilotId: p1.id, role: 'observer' as const }] : [])];
  return [
    { ...base, id: '00000000-0000-7000-8000-0000000b0001', name: 'Henderson substation thermal survey', purpose: 'Thermal and RGB survey of the north yard transformers ahead of the winter load.', plannedStart: at(6, 15), plannedEnd: at(6, 18), status: 'planned' as const, crew: crew(true), aircraftIds: [a0.id], authorizationIds: [auths[1]!.id], locationName: 'Henderson substation', location: { lat: 39.9208, lon: -104.8586 }, maxAltitudeAglM: 60, operationType: 'commercial' as const, deliverables: 'Radiometric JPEGs, anomaly report' },
    { ...base, id: '00000000-0000-7000-8000-0000000b0002', name: 'Centennial roof inspection', purpose: null, plannedStart: at(0, 15), plannedEnd: at(0, 17), status: 'in_progress' as const, crew: crew(false), aircraftIds: [a1?.id ?? a0.id], authorizationIds: [auths[2]!.id], locationName: 'Centennial Airport business park', location: { lat: 39.5701, lon: -104.8493 }, maxAltitudeAglM: 45, operationType: 'commercial' as const, flightCount: 2, flightSeconds: 2460 },
    { ...base, id: '00000000-0000-7000-8000-0000000b0003', name: 'Cherry Creek dam mapping', purpose: 'Orthomosaic for the spillway survey.', plannedStart: at(-12, 16), plannedEnd: at(-12, 19), status: 'completed' as const, crew: crew(true), aircraftIds: [a0.id], authorizationIds: [], locationName: 'Cherry Creek State Park', location: { lat: 39.6383, lon: -104.8602 }, maxAltitudeAglM: 120, operationType: 'commercial' as const, flightCount: 4, flightSeconds: 6120 },
    { ...base, id: '00000000-0000-7000-8000-0000000b0004', name: 'New pilot training block', purpose: 'Manual flight proficiency for the new hires.', plannedStart: null, plannedEnd: null, status: 'draft' as const, crew: [], aircraftIds: [], authorizationIds: [], locationName: null, location: null, maxAltitudeAglM: null, operationType: 'training' as const },
  ];
}

const TODAY = '2026-10-08';
const NOW = new Date('2026-10-08T16:00:00Z');
const TZ = 'America/Denver';
const OUT = join(import.meta.dirname, '..', 'fixtures');
const rules = resolveRulePack(latestPack('US-FAA-Part107'));
const ctx: MapContext = { today: TODAY, now: NOW, units: DEFAULT_UNITS_US, orgTimeZone: TZ };

// ---------------------------------------------------------------- deterministic helpers

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idFactory(scenario: number) {
  let n = 0;
  return () => {
    n += 1;
    const tail = (scenario * 1_000_000 + n).toString(16).padStart(12, '0');
    return `0199c4a0-0000-7000-8000-${tail}`;
  };
}

const addDaysIso = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface World {
  id: string;
  description: string;
  seed: number;
  org: { id: string; name: string };
  currentUser: { id: string; name: string; email: string; role: Role };
  otherOrgs: { orgId: string; orgName: string; role: Role }[];
  members: { membershipId: string; userId: string; name: string; email: string; role: Role; expiresAt: string | null; createdAt: string }[];
  pilots: Pilot[];
  credentials: Credential[];
  aircraft: Aircraft[];
  batteries: Battery[];
  flights: Flight[];
  audit: (AuditEvent & { actorName: string | null })[];
  overrides: { ruleId: string; value: unknown; reason: string; setBy: string; setAt: string }[];
  fieldSync: SyncStateViewModel;
}

const SITES = [
  'Henderson Solar Farm', 'Cherry Creek Bridge', 'Riverside Substation', 'Lakewood Water Tower',
  'Golden Rooftop Survey', 'Boulder Creek Levee', 'Aurora Distribution Center', 'Castle Rock Quarry',
];
const MODELS: [string, string, number][] = [
  ['DJI', 'Mavic 3 Enterprise', 0.915], ['DJI', 'Matrice 30T', 3.77], ['DJI', 'Matrice 350 RTK', 6.47],
  ['Skydio', 'X10', 2.11], ['Autel', 'EVO II Dual 640T', 1.19], ['Freefly', 'Astro', 9.1],
  ['Quantum Systems', 'Trinity F90+', 5.0], ['DJI', 'Matrice 600 Pro', 9.5], ['Freefly', 'Alta 8', 6.2],
];

function base(id: string, orgId: string, createdAt = '2025-01-15T17:00:00.000Z') {
  return { id, orgId, createdAt, updatedAt: createdAt, createdBy: null, deletedAt: null };
}

// ---------------------------------------------------------------- world builders

function buildWorld(opts: {
  id: string;
  description: string;
  seed: number;
  orgName: string;
  pilotNames: string[];
  aircraftCount: number;
  batteriesPerAircraft: number;
  flights: number;
  credentialMode: 'healthy' | 'mixed' | 'expired';
  longNames?: boolean;
  fieldSync?: SyncStateViewModel;
}): World {
  const rnd = prng(opts.seed);
  const nid = idFactory(opts.seed);
  const orgId = nid();
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;

  const members: World['members'] = [];
  const pilots: Pilot[] = [];
  const credentials: Credential[] = [];
  opts.pilotNames.forEach((name, i) => {
    const userId = nid();
    const membershipId = nid();
    const role: Role = i === 0 ? 'owner' : i === 1 && opts.pilotNames.length > 3 ? 'chief_pilot' : 'pilot';
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;
    members.push({ membershipId, userId, name, email, role, expiresAt: null, createdAt: `2025-0${(i % 8) + 1}-1${i % 9}T15:30:00.000Z` });
    const pilotId = nid();
    pilots.push({ ...base(pilotId, orgId), membershipId, displayName: name, email, phone: null, certificateNumber: String(4_100_000 + Math.floor(rnd() * 899_999)), active: true });

    const certIssued = addDaysIso('2019-06-01', Math.floor(rnd() * 1500));
    credentials.push({ ...base(nid(), orgId), pilotId, credentialType: 'part107_certificate', jurisdiction: 'US-FAA-Part107', identifier: pilots.at(-1)!.certificateNumber, issuedOn: certIssued, expiresOn: null, notes: null, documentIds: [nid()] });

    // Recurrent issue date determines currency (24 calendar months).
    let recurrentAgoDays: number;
    if (opts.credentialMode === 'expired') recurrentAgoDays = 760 + Math.floor(rnd() * 300);
    else if (opts.credentialMode === 'healthy') recurrentAgoDays = 60 + Math.floor(rnd() * 400);
    else recurrentAgoDays = [120, 300, 690, 705, 745, 400, 30, 520, 715, 800, 210, 660][i % 12]!;
    if (!(opts.credentialMode === 'mixed' && i === 6)) {
      credentials.push({ ...base(nid(), orgId), pilotId, credentialType: 'part107_recurrent', jurisdiction: 'US-FAA-Part107', identifier: null, issuedOn: addDaysIso(TODAY, -recurrentAgoDays), expiresOn: null, notes: null, documentIds: [] });
    }
    if (i % 3 === 0) {
      credentials.push({ ...base(nid(), orgId), pilotId, credentialType: 'night_operations_training', jurisdiction: 'US-FAA-Part107', identifier: null, issuedOn: addDaysIso(TODAY, -recurrentAgoDays), expiresOn: null, notes: null, documentIds: [] });
    }
  });

  const aircraft: Aircraft[] = [];
  const batteries: Battery[] = [];
  for (let i = 0; i < opts.aircraftCount; i++) {
    const [make, model, mass] = MODELS[i % MODELS.length]!;
    const id = nid();
    const regExpiresOn =
      opts.credentialMode === 'expired' ? addDaysIso(TODAY, -20 - i * 13)
      : opts.credentialMode === 'mixed' && i === 2 ? addDaysIso(TODAY, 19)
      : opts.credentialMode === 'mixed' && i === 4 ? null
      : addDaysIso(TODAY, 200 + i * 97);
    const grounded = (opts.credentialMode === 'mixed' && i === 1) || (opts.credentialMode === 'expired' && i === 0);
    const nickname = opts.longNames
      ? `Northern Colorado Regional Infrastructure Inspection Unit ${i + 1} — Thermal & LiDAR Configuration`
      : i % 2 === 0 ? `${['Falcon', 'Kestrel', 'Osprey', 'Harrier', 'Merlin', 'Condor', 'Raven', 'Swift', 'Heron'][i % 9]} ${i + 1}` : null;
    aircraft.push({
      ...base(id, orgId),
      nickname,
      make,
      model,
      serialNumber: `${make.slice(0, 2).toUpperCase()}${(1581 + i * 7919).toString(36).toUpperCase()}${(10000 + i * 313).toString()}`,
      registrationNumber: regExpiresOn ? `FA3${(48213 + i * 977).toString(36).toUpperCase().padStart(7, 'X')}` : null,
      registrationExpiresOn: regExpiresOn,
      remoteIdMethod: i % 4 === 3 ? 'broadcast_module' : 'standard',
      remoteIdSerial: `1581F${(5000000 + i * 4111).toString(16).toUpperCase()}`,
      takeoffMassKg: mass,
      firmwareVersion: `v${1 + (i % 3)}.${(i * 7) % 10}.${(i * 3) % 20}`,
      status: grounded ? 'grounded' : 'active',
      groundedReason: grounded ? (opts.credentialMode === 'expired' ? 'Overdue 200-hour motor inspection' : 'Gimbal damage after hard landing — incident open') : null,
      totalFlightSeconds: 0,
      totalFlights: 0,
    });
    for (let b = 0; b < opts.batteriesPerAircraft; b++) {
      const maxCycles = 200;
      const cycles = opts.credentialMode === 'expired' ? 196 + b * 6 : Math.floor(rnd() * (b === 0 && i === 0 ? 195 : 170));
      batteries.push({
        ...base(nid(), orgId),
        serialNumber: `BAT-${(i + 1).toString().padStart(2, '0')}-${(b + 1).toString().padStart(2, '0')}-${(7700 + i * 31 + b).toString()}`,
        label: `${aircraftName(aircraft.at(-1)!).split(' ')[0]} #${b + 1}`,
        chemistry: 'lihv',
        cellCount: 4,
        ratedCapacityMah: 5000,
        cycleCount: cycles,
        status: cycles >= maxCycles ? 'retired' : 'active',
        aircraftModel: model,
        purchasedOn: addDaysIso('2024-03-01', i * 20),
        thresholds: { maxCycles, minCapacityPct: 80, maxCellDeviationMv: 50, maxAgeDays: null },
        notes: null,
      });
    }
  }

  const flights: Flight[] = [];
  for (let i = 0; i < opts.flights && aircraft.length && pilots.length; i++) {
    const daysAgo = Math.floor((i / Math.max(opts.flights, 1)) * 540) + Math.floor(rnd() * 3);
    const hour = 14 + Math.floor(rnd() * 9);
    const takeoff = new Date(`${addDaysIso(TODAY, -daysAgo - 1)}T${String(hour).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000Z`);
    const dur = 300 + Math.floor(rnd() * 1500);
    const ac = pick(aircraft.filter((a) => a.status !== 'retired'));
    const pilot = pick(pilots);
    const site = pick(SITES);
    const acBatteries = batteries.filter((b) => b.aircraftModel === ac.model);
    flights.push({
      ...base(nid(), orgId, takeoff.toISOString()),
      pilotInCommandId: pilot.id,
      visualObserverIds: rnd() > 0.7 && pilots.length > 1 ? [pilots.find((p) => p.id !== pilot.id)!.id] : [],
      aircraftId: ac.id,
      batteries: acBatteries.length ? [{ batteryId: pick(acBatteries).id, startPct: 100, endPct: 20 + Math.floor(rnd() * 40) }] : [],
      takeoffAt: takeoff.toISOString(),
      landingAt: new Date(takeoff.getTime() + dur * 1000).toISOString(),
      localTimeZone: TZ,
      takeoffPoint: { lat: 39.7 + rnd() * 0.4, lon: -105.2 + rnd() * 0.4, altMslM: 1600 + rnd() * 200 },
      landingPoint: null,
      locationName: opts.longNames ? `${site} — North Access Road Staging Area, Gate 14 (Contractor Entrance Only)` : site,
      durationSeconds: dur,
      maxAltitudeAglM: 30 + Math.floor(rnd() * 90),
      maxDistanceM: 100 + Math.floor(rnd() * 900),
      totalDistanceM: 500 + Math.floor(rnd() * 4000),
      hasPath: i % 5 !== 0,
      weather: null,
      airspaceClass: rnd() > 0.8 ? 'D' : 'G',
      authorizationId: null,
      missionId: null,
      siteId: null,
      operationType: rnd() > 0.9 ? 'training' : 'commercial',
      notes: i % 7 === 0 ? 'Gusty winds above 200 ft; RTH tested before mission.' : null,
      source: i % 3 === 0 ? 'manual' : 'import',
      importParser: i % 3 === 0 ? null : 'px4-ulog',
      rawLogDocumentId: null,
    });
    ac.totalFlights += 1;
    ac.totalFlightSeconds += dur;
  }
  flights.sort((a, b) => b.takeoffAt.localeCompare(a.takeoffAt));

  const owner = members[0];
  const audit: World['audit'] = owner
    ? [
        { id: 1004, orgId, at: '2026-10-07T21:14:09.000Z', actorUserId: owner.userId, actorName: owner.name, requestId: 'req-4', tableName: 'org_rule_overrides', rowId: nid(), operation: 'INSERT', before: null, after: { rule_id: 'operation.max_altitude_agl', value: 91.44, reason: 'Company SOP caps altitude at 300 ft' } },
        ...(aircraft[1] ? [{ id: 1003, orgId, at: '2026-10-06T18:02:44.000Z', actorUserId: owner.userId, actorName: owner.name, requestId: 'req-3', tableName: 'aircraft', rowId: aircraft[1].id, operation: 'UPDATE' as const, before: { status: 'active', grounded_reason: null }, after: { status: aircraft[1].status, grounded_reason: aircraft[1].groundedReason } }] : []),
        { id: 1002, orgId, at: '2026-10-02T03:40:00.000Z', actorUserId: null, actorName: null, requestId: null, tableName: 'flights', rowId: flights[0]?.id ?? nid(), operation: 'UPDATE', before: { duration_seconds: 900 }, after: { duration_seconds: 1500 } },
        { id: 1001, orgId, at: '2025-01-15T17:00:00.000Z', actorUserId: owner.userId, actorName: owner.name, requestId: 'req-1', tableName: 'organizations', rowId: orgId, operation: 'INSERT', before: null, after: { name: opts.orgName, timezone: TZ } },
      ]
    : [];

  const currentUser = owner
    ? { id: owner.userId, name: owner.name, email: owner.email, role: owner.role }
    : { id: nid(), name: 'Jordan Avery', email: 'jordan.avery@example.com', role: 'owner' as Role };
  if (!owner) members.push({ membershipId: nid(), userId: currentUser.id, name: currentUser.name, email: currentUser.email, role: 'owner', expiresAt: null, createdAt: '2026-10-08T15:55:00.000Z' });

  return {
    id: opts.id,
    description: opts.description,
    seed: opts.seed,
    org: { id: orgId, name: opts.orgName },
    currentUser,
    otherOrgs: [],
    members,
    pilots,
    credentials,
    aircraft,
    batteries,
    flights,
    audit,
    overrides: owner ? [{ ruleId: 'operation.max_altitude_agl', value: 91.44, reason: 'Company SOP caps altitude at 300 ft', setBy: owner.name, setAt: '2026-10-07T21:14:09.000Z' }] : [],
    fieldSync: opts.fieldSync ?? { status: 'online', pendingChanges: 0, lastSynced: displayInstant('2026-10-08T15:58:00.000Z', TZ, NOW), message: null, conflictCount: 0 },
  };
}

// ---------------------------------------------------------------- insurance + maintenance (derived from the world, deterministic)

const entityBase = (w: World, n: number) => ({
  id: `0199c4a0-0000-7000-9000-${(w.seed * 1_000_000 + n).toString(16).padStart(12, '0')}`,
  orgId: w.org.id,
  createdAt: '2026-01-15T17:00:00.000Z',
  updatedAt: '2026-01-15T17:00:00.000Z',
  createdBy: w.currentUser.id,
  deletedAt: null,
});

function insuranceFor(w: World): InsurancePolicy[] {
  const active = w.aircraft.filter((a) => a.status !== 'retired');
  if (!active.length) return [];
  const lapsed = w.id === 'expired';
  return [
    {
      ...entityBase(w, 1),
      carrier: 'Skyward Aviation Insurance',
      policyNumber: `SAI-${String(w.seed).padStart(2, '0')}-448812`,
      coverageSummary: 'Commercial UAS liability, $1M per occurrence; hull coverage at agreed value.',
      liabilityLimitCents: 100_000_000,
      effectiveOn: lapsed ? '2025-09-01' : '2025-11-01',
      expiresOn: lapsed ? '2026-09-01' : '2026-10-31',
      // Leave the newest aircraft off the policy so "not covered" has something to show.
      coveredAircraftIds: active.slice(0, Math.max(1, active.length - 1)).map((a) => a.id),
      documentIds: [],
    },
  ];
}

function schedulesFor(w: World): MaintenanceSchedule[] {
  const propsDue = w.aircraft.find((a, i) => i > 0 && a.status !== 'retired' && a.totalFlights >= 28)?.id;
  return w.aircraft
    .filter((a) => a.status !== 'retired')
    .flatMap((a, i) => {
      // One aircraft's props are nearly due (overdue in the "expired" scenario).
      const props: MaintenanceSchedule[] =
        a.id === propsDue
          ? [
              {
                ...entityBase(w, 300 + i),
                name: 'Propeller replacement',
                target: { type: 'aircraft' as const, id: a.id },
                everyFlightSeconds: null,
                everyFlights: 25,
                everyDays: null,
                lastDoneAt: '2026-08-10T16:00:00.000Z',
                lastDoneFlightSeconds: null,
                lastDoneFlights: a.totalFlights - (w.id === 'expired' ? 27 : 23),
                groundsWhenOverdue: true,
              },
            ]
          : [];
      return [
        ...props,
        {
          ...entityBase(w, 100 + i * 2),
          name: 'Motor and propeller inspection',
          target: { type: 'aircraft' as const, id: a.id },
          everyFlightSeconds: 50 * 3600,
          everyFlights: null,
          everyDays: null,
          lastDoneAt: '2026-06-01T16:00:00.000Z',
          lastDoneFlightSeconds: Math.max(0, a.totalFlightSeconds - 6 * 3600),
          lastDoneFlights: null,
          groundsWhenOverdue: true,
        },
        {
          ...entityBase(w, 101 + i * 2),
          name: 'Airframe and gimbal inspection',
          target: { type: 'aircraft' as const, id: a.id },
          everyFlightSeconds: null,
          everyFlights: 200,
          everyDays: 180,
          lastDoneAt: w.id === 'expired' ? '2026-02-01T16:00:00.000Z' : '2026-07-20T16:00:00.000Z',
          lastDoneFlightSeconds: null,
          lastDoneFlights: Math.max(0, a.totalFlights - 40),
          groundsWhenOverdue: false,
        },
      ];
    });
}

function maintenanceHistoryFor(w: World, schedules: MaintenanceSchedule[]): MaintenanceEvent[] {
  return schedules
    .filter((s) => s.lastDoneAt)
    .map((s, i) => ({
      ...entityBase(w, 500 + i),
      kind: 'scheduled' as const,
      scheduleId: s.id,
      target: s.target,
      performedAt: s.lastDoneAt!,
      performedBy: w.members.find((m) => m.role === 'maintenance_tech')?.name ?? w.currentUser.name,
      description: s.name.startsWith('Motor') ? 'Inspected motors for bearing play; replaced 2 propellers (nicks on leading edge).' : 'Airframe, arms, and gimbal dampers inspected. No defects found.',
      partsReplaced: s.name.startsWith('Motor') ? [{ name: 'Propeller', serialNumber: null }, { name: 'Propeller', serialNumber: null }] : [],
      flightSecondsAtService: s.lastDoneFlightSeconds,
      signedOffByUserId: null,
      signedOffAt: null,
      documentIds: [],
    }))
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
}

// ---------------------------------------------------------------- world → screens

function toScenario(w: World): FixtureScenario {
  const role = w.currentUser.role;
  const memberships = [{ orgId: w.org.id, orgName: w.org.name, role }, ...w.otherOrgs];
  const shellFor = (href: string, sync?: SyncStateViewModel) =>
    buildShell({ user: w.currentUser, role, organization: w.org, memberships, activeHref: href, sync, basePath: '/certa' });
  const pilotName = (id: string) => w.pilots.find((p) => p.id === id)?.displayName ?? 'Unknown pilot';
  const acName = (id: string) => {
    const a = w.aircraft.find((x) => x.id === id);
    return a ? aircraftName(a) : 'Unknown aircraft';
  };
  const resolved: ResolvedRulePack = resolveRulePack(
    rules.pack,
    w.overrides.map((o) => ({ ruleId: o.ruleId, value: o.value, reason: o.reason })),
  );

  const pilotSummaries = new Map<string, ReadinessSummary>(
    w.pilots.map((p) => [p.id, pilotReadiness(p, w.credentials.filter((c) => c.pilotId === p.id), resolved, ctx)]),
  );
  const aircraftSummaries = new Map<string, ReadinessSummary>(
    w.aircraft.map((a) => [a.id, aircraftReadiness(a, [], ctx)]),
  );
  const levels = [...pilotSummaries.values(), ...aircraftSummaries.values()].map((s) => s.level);
  const counts = { green: levels.filter((l) => l === 'green').length, amber: levels.filter((l) => l === 'amber').length, red: levels.filter((l) => l === 'red').length };
  const overall = summarize([], TODAY);
  overall.level = counts.red ? 'red' : counts.amber ? 'amber' : 'green';

  const upcoming = [
    ...[...pilotSummaries.entries()].flatMap(([id, s]) => s.items.map((i) => ({ i, subject: pilotName(id), href: `/pilots/${id}` }))),
    ...[...aircraftSummaries.entries()].flatMap(([id, s]) => s.items.map((i) => ({ i, subject: acName(id), href: `/aircraft/${id}` }))),
  ]
    .filter(({ i }) => i.dueOn && i.daysRemaining! <= 90)
    .sort((a, b) => a.i.dueOn!.localeCompare(b.i.dueOn!))
    .map(({ i, subject, href }) => ({ label: i.label, subject, due: displayDate(i.dueOn!, TODAY), level: i.level, href }));

  const flightTotals = (pred: (f: Flight) => boolean) => {
    const fs = w.flights.filter(pred);
    return { count: fs.length, seconds: fs.reduce((s, f) => s + f.durationSeconds, 0), last: fs[0]?.takeoffAt ?? null };
  };
  const flightRows = w.flights.map((f, i) => toFlightRow(f, { pilot: pilotName(f.pilotInCommandId), aircraft: acName(f.aircraftId) }, ctx, w.fieldSync.pendingChanges > 0 && i < w.fieldSync.pendingChanges));

  const p0 = w.pilots[0];
  const a0 = w.aircraft[0];
  const f0 = w.flights[0];
  const lastFlightOf = (batteryId: string) => w.flights.find((f) => f.batteries.some((b) => b.batteryId === batteryId))?.takeoffAt ?? null;
  const empty = (title: string, body: string, actionLabel: string | null) => ({ title, body, actionLabel });
  const ok = { loading: false, error: null };
  const canDo = (a: Parameters<typeof can>[1]) => can(role, a);

  const pilotOptions = w.pilots.map((p) => ({ value: p.id, label: p.displayName, status: badgeFromSummary(pilotSummaries.get(p.id)!) }));
  const aircraftOptions = w.aircraft.map((a, i) => ({ value: a.id, label: aircraftName(a), status: toAircraftRow(a, aircraftSummaries.get(a.id)!).status, recent: i < 2 }));
  const warnings = p0 ? pilotSummaries.get(p0.id)!.reasons.map((r) => reasonFromItem(r, TODAY, `/pilots/${p0.id}`)) : [];

  const snapshot: FleetSnapshot = {
    organization: { id: w.org.id, name: w.org.name, timezone: TZ, units: DEFAULT_UNITS_US, defaultJurisdiction: 'US-FAA-Part107' },
    rulePack: rules.pack,
    overrides: w.overrides.map((o) => ({ ruleId: o.ruleId, value: o.value, reason: o.reason })),
    pilots: w.pilots,
    credentials: w.credentials,
    aircraft: w.aircraft,
    batteries: w.batteries,
    insurancePolicies: insuranceFor(w),
    maintenanceSchedules: schedulesFor(w),
    pilotTotals: Object.fromEntries(
      w.pilots.map((p) => {
        const t = flightTotals((f) => f.pilotInCommandId === p.id);
        const last90 = w.flights.filter((f) => f.pilotInCommandId === p.id && f.takeoffAt >= `${addDaysIso(TODAY, -90)}T00:00:00Z`).length;
        return [p.id, { flights: t.count, flightSeconds: t.seconds, lastFlightAt: t.last, last90DaysFlights: last90 }];
      }),
    ),
    batteryLastUsed: Object.fromEntries(w.batteries.map((b) => [b.id, lastFlightOf(b.id)])),
    lastFlight: w.flights[0] ?? null,
    recentLocations: [...new Set(w.flights.map((f) => f.locationName).filter((x): x is string => !!x))],
    recentFlightCounts: {
      last7: w.flights.filter((f) => Date.parse(f.takeoffAt) >= NOW.getTime() - 7 * 86400_000).length,
      last30: w.flights.filter((f) => Date.parse(f.takeoffAt) >= NOW.getTime() - 30 * 86400_000).length,
    },
    generatedAt: NOW.toISOString(),
  };
  const bi: BuildInput = { snapshot, ctx, role };

  return {
    id: w.id,
    description: w.description,
    shell: shellFor('/'),
    fieldShell: shellFor('/', w.fieldSync),
    screens: {
      readinessDashboard: buildReadinessDashboard(bi),
      pilotList: buildPilotList(bi),
      pilotDetail: p0 ? buildPilotDetail(bi, p0.id, w.flights) : { ...buildPilotDetail(bi, '', []), pilot: null },
      aircraftList: buildAircraftList(bi),
      aircraftDetail: a0 ? buildAircraftDetail(bi, a0.id, w.flights, maintenanceHistoryFor(w, snapshot.maintenanceSchedules)) : buildAircraftDetail(bi, '', []),
      batteryList: buildBatteryList(bi),
      flightList: buildFlightList(
        bi,
        { items: w.flights.map((f, i) => ({ ...f, pendingSync: w.fieldSync.pendingChanges > 0 && i < w.fieldSync.pendingChanges })), total: w.flights.length, nextCursor: null },
        { pilotId: null, aircraftId: null, from: null, to: null },
        { flights: w.flights.length, flightSeconds: w.flights.reduce((t, f) => t + f.durationSeconds, 0) },
      ),
      flightDetail: buildFlightDetail(bi, f0 ?? null, {
        preflight: f0 && f0.source === 'manual' ? goNoGo(snapshot, { pilotId: f0.pilotInCommandId, aircraftId: f0.aircraftId, batteryIds: f0.batteries.map((b) => b.batteryId) }, ctx) : null,
        // Fixtures have no recorded track; draw a plausible one so the map and profile render.
        path: f0?.hasPath
          ? { type: 'LineString', coordinates: Array.from({ length: 24 }, (_, i) => [f0.takeoffPoint!.lon + Math.sin(i / 4) * 0.002, f0.takeoffPoint!.lat + i * 0.0001, 1650 + Math.min(i, 12) * 6]) }
          : null,
        // A signed checklist with one optional item left open, so both states render.
        checklist: f0 && f0.source === 'manual'
          ? {
              templateName: 'Standard pre-flight',
              templateVersion: 1,
              completed: true,
              signedAt: f0.takeoffAt,
              sections: DEFAULT_PREFLIGHT_SECTIONS.map((sec) => ({ title: sec.title, items: sec.items.map((it) => ({ id: it.id, text: it.text, required: it.required, checked: it.required, note: null })) })),
            }
          : null,
        altitudeProfile: f0 ? Array.from({ length: 24 }, (_, i) => ({ t: Math.round((f0.durationSeconds / 23) * i), altitude: Math.round(Math.min(i, 12, 23 - i) * ((f0.maxAltitudeAglM ?? 60) / 12) / 0.3048) })) : [],
      }),
      logFlight: (() => {
        const lf = buildLogFlight(bi, {
          currentPilotId: p0?.id ?? null,
          now: NOW,
          authorizations: sampleAuthorizations(p0?.id ?? null),
          checklist: { id: '00000000-0000-7000-8000-00000000c001', orgId: '00000000-0000-7000-8000-000000000001', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), createdBy: null, deletedAt: null, name: 'Standard pre-flight', kind: 'preflight', version: 1, isDefault: true, sections: DEFAULT_PREFLIGHT_SECTIONS },
        });
        const d = lf.defaults;
        return { ...lf, preflight: d.pilotId && d.aircraftId ? goNoGo(snapshot, { pilotId: d.pilotId, aircraftId: d.aircraftId, batteryIds: d.batteryIds }, ctx) : null };
      })(),
      maintenance: buildMaintenance(bi, maintenanceHistoryFor(w, snapshot.maintenanceSchedules)),
      insurance: buildInsurance(bi),
      authorizations: buildAuthorizations(bi, sampleAuthorizations(p0?.id ?? null), { ownPilotId: null }),
      missions: buildMissions(bi, sampleMissions(w), sampleAuthorizations(p0?.id ?? null)),
      missionDetail: buildMissionDetail(bi, sampleMissions(w)[1] ?? null, { authorizations: sampleAuthorizations(p0?.id ?? null), flights: w.flights.slice(0, 2), ownPilotId: null }),
      missionForm: buildMissionForm(bi, sampleMissions(w)[0] ?? null, { authorizations: sampleAuthorizations(p0?.id ?? null) }),
      checklistsAdmin: buildChecklistsAdmin(bi, [
        { id: '00000000-0000-7000-8000-00000000c001', orgId: '00000000-0000-7000-8000-000000000001', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), createdBy: null, deletedAt: null, name: 'Standard pre-flight', kind: 'preflight', version: 3, isDefault: true, sections: DEFAULT_PREFLIGHT_SECTIONS },
        { id: '00000000-0000-7000-8000-00000000c002', orgId: '00000000-0000-7000-8000-000000000001', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), createdBy: null, deletedAt: null, name: 'Lost link', kind: 'emergency', version: 1, isDefault: false, sections: [{ id: 'll', title: 'Lost link', items: [{ id: 'rth', text: 'Confirm return-to-home engaged', required: true, photoRequired: false }, { id: 'notify', text: 'Notify visual observer and clear the landing zone', required: true, photoRequired: false }] }] },
      ]),
      rulePackAdmin: {
        ...ok,
        pack: {
          jurisdiction: resolved.jurisdiction,
          name: resolved.pack.name,
          version: resolved.version,
          authority: resolved.pack.authority,
          effectiveFrom: displayDate(resolved.pack.effectiveFrom, TODAY),
          disclaimer: resolved.pack.disclaimer,
          ruleCount: resolved.pack.rules.length,
          unverifiedCount: resolved.pack.rules.filter((r) => r.needsVerification).length,
        },
        availableJurisdictions: [{ jurisdiction: 'US-FAA-Part107', name: resolved.pack.name, active: true }],
        credentialTypes: resolved.pack.credentialTypes.map((t) => {
          const rule = t.validityRuleId ? resolved.rules.get(t.validityRuleId) : null;
          return { id: t.id, label: t.label, description: t.description, validity: rule ? `${rule.statedAs ?? ''} (${rule.source.citation})`.trim() : 'Does not expire', requiredForCurrency: t.requiredForCurrency };
        }),
        rules: [...resolved.rules.values()].map((r) => {
          const ov = w.overrides.find((o) => o.ruleId === r.id);
          return toRuleRow(r, ctx, { canOverride: canDo('rules.override'), override: ov ? { setBy: ov.setBy, setAt: ov.setAt } : null });
        }),
        filter: { search: '', appliesTo: null, unverifiedOnly: false },
        empty: empty('No rules match', 'Try clearing the search or filters.', null),
      },
      membersAdmin: {
        ...ok,
        members: w.members.map((m) => toMemberRow(m, w.currentUser.id, ctx)),
        roleOptions: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] })),
        canManage: canDo('members.manage'),
        empty: empty('Just you so far', 'Invite pilots, maintenance techs, or an auditor. Each person gets a sign-in link by email.', 'Invite someone'),
      },
      orgSettings: {
        ...ok,
        values: { name: w.org.name, timezone: TZ, units: { ...DEFAULT_UNITS_US }, defaultJurisdiction: 'US-FAA-Part107' },
        options: {
          timezones: ['America/Denver', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'].map((z) => ({ value: z, label: z.replace('_', ' ') })),
          length: [{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Metres' }],
          speed: [{ value: 'mph', label: 'mph' }, { value: 'kph', label: 'km/h' }, { value: 'kt', label: 'Knots' }, { value: 'mps', label: 'm/s' }],
          mass: [{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }, { value: 'g', label: 'Grams' }],
          temperature: [{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }],
          jurisdictions: [{ value: 'US-FAA-Part107', label: 'United States — FAA Part 107' }],
        },
        canEdit: canDo('org.update'),
        saving: false,
        notifications: { availability: 'available' as const, enabled: false, busy: false, message: null },
      },
      auditLog: {
        ...ok,
        events: w.audit.map((e) => toAuditEventViewModel(e, ctx)),
        hasMore: false,
        filter: { entity: null, actorUserId: null },
        entityOptions: [
          { value: 'flights', label: 'Flights' },
          { value: 'aircraft', label: 'Aircraft' },
          { value: 'pilots', label: 'Pilots' },
          { value: 'credentials', label: 'Credentials' },
          { value: 'org_rule_overrides', label: 'Rule overrides' },
          { value: 'memberships', label: 'Members' },
        ],
        empty: empty('No changes recorded yet', 'Every change to your records will appear here with who made it and what changed.', null),
      },
      syncConflicts: {
        ...ok,
        conflicts:
          w.fieldSync.conflictCount > 0 && f0
            ? [
                {
                  id: 'conflict-1',
                  entityLabel: `Flight on ${displayInstant(f0.takeoffAt, f0.localTimeZone, NOW).absolute}`,
                  field: 'landing_at',
                  fieldLabel: 'Landing time',
                  localValue: displayInstant(new Date(new Date(f0.landingAt).getTime() + 120_000).toISOString(), f0.localTimeZone, NOW).absolute,
                  serverValue: displayInstant(f0.landingAt, f0.localTimeZone, NOW).absolute,
                  localChangedBy: pilotName(f0.pilotInCommandId),
                  serverChangedBy: w.members[1]?.name ?? w.currentUser.name,
                  localAt: displayInstant('2026-10-07T22:10:00.000Z', TZ, NOW),
                  serverAt: displayInstant('2026-10-08T14:02:00.000Z', TZ, NOW),
                },
              ]
            : [],
        empty: empty('Everything is in sync', 'Changes made offline sync automatically. Anything that needs a decision will appear here.', null),
      },
    },
  };
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including billing and rule-pack overrides.',
  admin: 'Everything except billing.',
  chief_pilot: 'Manage pilots, missions, checklists, and approvals.',
  pilot: 'Log own flights, run checklists, report incidents, view assigned missions.',
  maintenance_tech: 'Maintenance events, components, batteries, and grounding.',
  viewer: 'Read-only access.',
  auditor: 'Time-boxed, read-only access to a defined scope. Every view is logged.',
};

// ---------------------------------------------------------------- scenarios

const COMPANY_PILOTS = [
  'Maya Thornton', 'Luis Ortega', 'Priya Natarajan', 'Ben Okafor', 'Hannah Kowalski', 'Darnell Brooks',
  'Sofia Lindqvist', 'Kenji Watanabe', 'Grace Mbeki', 'Tomás Herrera', 'Avery Chen', 'Mike Delgado',
];

const worlds: World[] = [
  buildWorld({ id: 'solo', description: 'Solo Part 107 pilot: one pilot, two aircraft, all current.', seed: 1, orgName: 'Reyes Aerial Imaging', pilotNames: ['Dana Reyes'], aircraftCount: 2, batteriesPerAircraft: 3, flights: 38, credentialMode: 'healthy' }),
  buildWorld({
    id: 'company',
    description: '12-pilot service company with mixed readiness: a grounded aircraft, an expiring registration, a missing registration, a pilot missing recurrent training, and some recurrents expiring soon. Mobile is offline with pending changes and one conflict.',
    seed: 2,
    orgName: 'Summit Inspection Services',
    pilotNames: COMPANY_PILOTS,
    aircraftCount: 9,
    batteriesPerAircraft: 4,
    flights: 240,
    credentialMode: 'mixed',
    fieldSync: { status: 'offline', pendingChanges: 3, lastSynced: displayInstant('2026-10-07T22:41:00.000Z', TZ, NOW), message: 'Offline — 3 changes will sync when you reconnect', conflictCount: 1 },
  }),
  buildWorld({ id: 'expired', description: 'Everything expired: recurrent training, registrations, batteries at end of life, one aircraft grounded.', seed: 3, orgName: 'Lapsed Drone Works', pilotNames: ['Riley Fenwick', 'Jordan Pike', 'Casey Morrow'], aircraftCount: 3, batteriesPerAircraft: 2, flights: 25, credentialMode: 'expired' }),
  buildWorld({ id: 'empty', description: 'Brand-new organization: no pilots, aircraft, batteries, or flights. Exercises every empty state.', seed: 4, orgName: 'New Horizon UAS', pilotNames: [], aircraftCount: 0, batteriesPerAircraft: 0, flights: 0, credentialMode: 'healthy' }),
  buildWorld({
    id: 'longNames',
    description: 'Very long names everywhere: organization, pilots, aircraft nicknames, and locations.',
    seed: 5,
    orgName: 'Northern Colorado Regional Infrastructure Inspection & Emergency Response Unmanned Aircraft Systems Program',
    pilotNames: ['Maximilian Alexander Featherstonehaugh-Montgomery III', 'Anastasia Konstantinovna Vasilyeva-Rimsky-Korsakova', 'Jean-Baptiste Emmanuel Zorg de la Croix-Fontaine'],
    aircraftCount: 3,
    batteriesPerAircraft: 2,
    flights: 12,
    credentialMode: 'mixed',
    longNames: true,
  }),
  buildWorld({ id: 'large', description: '520 flights across 4 pilots and 4 aircraft, for list performance and pagination.', seed: 6, orgName: 'High Volume Mapping Co', pilotNames: ['Alex Rivera', 'Sam Patel', 'Morgan Lee', 'Taylor Brooks'], aircraftCount: 4, batteriesPerAircraft: 4, flights: 520, credentialMode: 'healthy' }),
];

const auth: AuthFixtures = {
  signIn: { loading: false, error: null, initialEmail: null, magicLinkSentTo: null, ssoProviders: [] },
  signInMagicLinkSent: { loading: false, error: null, initialEmail: 'dana.reyes@example.com', magicLinkSentTo: 'dana.reyes@example.com', ssoProviders: [] },
  signInError: { loading: false, error: 'That email and password don’t match. Try again or use a sign-in link.', initialEmail: 'dana.reyes@example.com', magicLinkSentTo: null, ssoProviders: [] },
  signUp: {
    loading: false,
    error: null,
    timezoneOptions: ['America/Denver', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'].map((z) => ({ value: z, label: z.replace('_', ' ') })),
    defaultTimezone: 'America/Denver',
    passwordMinLength: 12,
  },
};

// ---------------------------------------------------------------- write

const HEADER = '// GENERATED by `pnpm --filter @certa/contract gen:fixtures`. Do not edit by hand.\n// "Today" in all fixtures is 2026-10-08 (America/Denver).\n';

function file(name: string, typeImport: string, body: string) {
  return `${HEADER}${typeImport}\n\nexport const ${name} = ${body};\n`;
}

const outputs: Record<string, string> = {};
for (const w of worlds) {
  outputs[`${w.id}.ts`] = file(w.id, "import type { FixtureScenario } from './scenario.ts';", `${JSON.stringify(toScenario(w), null, 2)} satisfies FixtureScenario`);
}
outputs['auth.ts'] = file('auth', "import type { AuthFixtures } from './scenario.ts';", `${JSON.stringify(auth, null, 2)} satisfies AuthFixtures`);

let stale = false;
for (const [name, content] of Object.entries(outputs)) {
  const path = join(OUT, name);
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {}
    if (current !== content) {
      console.error(`contract/fixtures/${name} is stale`);
      stale = true;
    }
  } else writeFileSync(path, content);
}
if (stale) process.exit(1);
if (!process.argv.includes('--check')) console.log(`Wrote ${Object.keys(outputs).length} fixture files`);
