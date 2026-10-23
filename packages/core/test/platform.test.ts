import { describe, expect, it } from 'vitest';
import {
  announcementEndsAt,
  buildPlatformCompliance,
  filterPlatformPilots,
  monthsBetween,
  monthsEnding,
  platformComplianceItems,
  platformExportRows,
  platformOverview,
  platformPeriod,
  platformPilotRows,
  platformPilotRowVM,
  platformPresetRange,
  toCsv,
  type FleetSnapshot,
  type OrgBundle,
} from '../src/index.js';
import { testPack } from './fixtures.js';

const ORG = '00000000-0000-7000-8000-000000000001';
const base = { orgId: ORG, createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z', createdBy: null, deletedAt: null };
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const pilot = (n: number, name: string, membershipId: string | null = null, active = true) => ({ ...base, id: id(n), membershipId, displayName: name, email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, phone: null, certificateNumber: null, active });
const cred = (n: number, pilotId: string, credentialType: string, expiresOn: string | null) => ({ ...base, id: id(n), pilotId, credentialType, jurisdiction: 'XX-TEST', identifier: null, issuedOn: '2024-01-01', expiresOn, notes: null, documentIds: [] });

const DANA = id(1);
const IVAN = id(2);
const MARCUS = id(3);
const OLD = id(4);
const now = new Date('2026-10-21T16:00:00Z');

function bundle(): OrgBundle {
  const snapshot = {
    organization: { id: ORG, name: '=Arkhon', timezone: 'America/Denver', units: { length: 'ft', speed: 'mph', mass: 'lb', temperature: 'F' }, defaultJurisdiction: 'XX-TEST' },
    rulePack: testPack,
    overrides: [],
    pilots: [pilot(1, 'Dana Reyes'), pilot(2, 'Ivan Petrov', id(102)), pilot(3, 'Marcus Chen', id(103)), pilot(4, 'Old Timer', null, false)],
    credentials: [
      cred(11, DANA, 'cert', null),
      cred(12, DANA, 'recurrent', '2026-10-15'),
      cred(13, MARCUS, 'cert', null),
      cred(14, MARCUS, 'recurrent', '2026-11-30'),
    ],
    priorExperience: [],
    externalFlights: [{ ...base, id: id(50), pilotId: MARCUS, source: 'argus', externalId: 'J1', reference: null, takeoffAt: '2026-10-19T15:00:00Z', landingAt: '2026-10-19T15:30:00Z', durationSeconds: 1800, locationName: null, takeoffPoint: null, convertedFlightId: null }],
    aircraft: [],
    batteries: [],
    insurancePolicies: [],
    maintenanceSchedules: [],
    pilotTotals: {
      [DANA]: { flights: 2, flightSeconds: 3600, lastFlightAt: '2026-10-20T15:00:00Z', last90DaysFlights: 2, missions: 0 },
      [MARCUS]: { flights: 1, flightSeconds: 1800, lastFlightAt: '2026-10-19T15:00:00Z', last90DaysFlights: 1, missions: 1 },
    },
    batteryLastUsed: {},
    lastFlight: null,
    recentLocations: [],
    recentFlightCounts: { last7: 0, last30: 0 },
    generatedAt: now.toISOString(),
  } as unknown as FleetSnapshot;
  const f = (n: number, pilotId: string, takeoffAt: string, seconds: number, source: 'certa' | 'argus' = 'certa') => ({ id: id(n), source, pilotId, aircraftId: null, takeoffAt, landingAt: takeoffAt, durationSeconds: seconds, locationName: '@Field', operationType: null });
  return {
    org: { id: ORG, name: '=Arkhon', createdAt: '2026-01-01T00:00:00Z' },
    snapshot,
    ctx: { today: '2026-10-21', now, units: snapshot.organization.units, orgTimeZone: 'America/Denver' },
    flights: [f(60, DANA, '2026-10-20T15:00:00Z', 2400), f(61, DANA, '2026-09-02T15:00:00Z', 1200), f(62, MARCUS, '2026-10-19T15:00:00Z', 1800, 'argus')],
    members: [
      { membershipId: id(102), userId: id(202), role: 'pilot', email: 'ivan@example.com', arkhonUserId: null, lastSignInAt: null },
      { membershipId: id(103), userId: id(203), role: 'chief_pilot', email: 'marcus@example.com', arkhonUserId: 'ark-9', lastSignInAt: '2026-10-01T00:00:00Z' },
    ],
    discordPilotIds: [MARCUS],
    authorizations: [],
  };
}

describe('platform console', () => {
  it('flags who needs a hand, most urgent first, using the rule pack’s credential types', () => {
    const rows = platformPilotRows([bundle()], { arkhonAdminBase: 'https://arkhon.example' });
    expect(rows.map((r) => r.name)).toEqual(['Dana Reyes', 'Ivan Petrov', 'Marcus Chen', 'Old Timer']);
    const [dana, ivan, marcus, old] = rows;
    expect(dana).toMatchObject({ level: 'red', certificateOnFile: true, recurrentDueOn: '2026-10-15', account: 'no_account', arkhonAdminUrl: null });
    expect(dana!.helpFlags).toEqual(['recurrent_overdue', 'not_cleared']);
    expect(ivan!.helpFlags).toEqual(['no_certificate', 'not_cleared', 'never_signed_in', 'inactive_90d']);
    expect(marcus).toMatchObject({ account: 'active', arkhonLinked: true, discordLinked: true, argusWaiting: 1, arkhonAdminUrl: 'https://arkhon.example/app/admin/users/ark-9', role: 'chief_pilot' });
    expect(marcus!.helpFlags).toEqual(['recurrent_due_soon', 'argus_waiting']);
    expect(old!.helpFlags).toEqual([]);
  });

  it('lists compliance within the window, overdue first, and groups it', () => {
    const items = platformComplianceItems([bundle()], 60);
    expect(items[0]).toMatchObject({ subject: 'Ivan Petrov', level: 'red', daysRemaining: null });
    expect(items.map((i) => [i.subject, i.daysRemaining])).toContainEqual(['Dana Reyes', -6]);
    expect(items.map((i) => [i.subject, i.daysRemaining])).toContainEqual(['Marcus Chen', 40]);
    expect(platformComplianceItems([bundle()], 30).some((i) => i.subject === 'Marcus Chen')).toBe(false);
    expect(items.some((i) => i.subject === 'Old Timer')).toBe(false);
    const g = buildPlatformCompliance(items, now);
    expect(g.groups.map((x) => x.id)).toEqual(['now', 'later']);
    expect(g.counts).toMatchObject({ total: items.length, pilots: 3 });
  });

  it('sums the period and the 12 months behind it', () => {
    const o = platformOverview([bundle()], { from: '2026-09-22', to: '2026-10-21' }, now);
    expect(o.period).toMatchObject({ flights: 2, flightSeconds: 4200, pilotsFlown: 2, argusFlights: 1 });
    expect(o.totals).toMatchObject({ pilots: 3, activePilots30d: 2, neverSignedIn: 1, arkhonLinked: 1, discordLinked: 1 });
    expect(o.monthly.map((m) => m.month)).toEqual(monthsEnding('2026-10-21', 12));
    expect(o.monthly.at(-1)).toMatchObject({ month: '2026-10', flights: 2, flightSeconds: 4200, argusFlights: 1 });
    expect(o.monthly.at(-2)).toMatchObject({ month: '2026-09', flights: 1 });
    expect(o.topPilots[0]).toMatchObject({ name: 'Dana Reyes', flightSeconds: 2400 });
  });

  it('exports CSV with formulas neutralized', () => {
    const rows = platformExportRows('flights', [bundle()], { from: '2026-10-01', to: '2026-10-31' }, now);
    expect(rows).toHaveLength(3);
    const csv = toCsv(rows);
    expect(csv).toContain(`"'=Arkhon"`);
    expect(csv).toContain(`"'@Field"`);
    const hours = platformExportRows('pilot-hours', [bundle()], { from: '2026-09-01', to: '2026-10-31' }, now);
    expect(hours[0]).toEqual(['Organization', 'Pilot', '2026-09', '2026-10', 'Total']);
    expect(hours.find((r) => r[1] === 'Dana Reyes')).toEqual(['=Arkhon', 'Dana Reyes', '0.33', '0.67', '1.00']);
    expect(() => platformExportRows('secrets', [bundle()], { from: '2026-10-01', to: '2026-10-31' }, now)).toThrow();
  });

  it('filters the directory and names periods', () => {
    const vms = platformPilotRows([bundle()]).map((r) => platformPilotRowVM(r, now));
    expect(filterPlatformPilots(vms, { query: '', orgId: '', flag: 'any', level: 'all' }).map((r) => r.name)).toEqual(['Dana Reyes', 'Ivan Petrov', 'Marcus Chen']);
    expect(filterPlatformPilots(vms, { query: 'marc', orgId: '', flag: 'all', level: 'all' })).toHaveLength(1);
    expect(filterPlatformPilots(vms, { query: '', orgId: '', flag: 'never_signed_in', level: 'all' }).map((r) => r.name)).toEqual(['Ivan Petrov']);
    expect(vms[0]!.recurrent).toMatchObject({ level: 'red', text: 'Overdue · Oct 15, 2026' });
    expect(platformPeriod('2026-09-22', '2026-10-21', '2026-10-21')).toMatchObject({ preset: '30d', label: '30 days' });
    expect(platformPeriod('2026-02-01', '2026-03-01', '2026-10-21')).toMatchObject({ preset: 'custom', label: 'Feb 1, 2026 – Mar 1, 2026' });
    expect(platformPresetRange('ytd', '2026-10-21')).toEqual({ from: '2026-01-01', to: '2026-10-21' });
    expect(monthsBetween({ from: '2025-11-15', to: '2026-02-01' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(announcementEndsAt('')).toBeNull();
    expect(announcementEndsAt('2026-10-31')).toBe('2026-11-01T07:00:00.000Z');
  });
});
