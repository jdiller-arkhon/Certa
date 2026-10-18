import { describe, expect, it } from 'vitest';
import { buildInspectorPacket, buildPilotDetail, buildPilotList, type FleetSnapshot } from '../src/index.js';
import { testPack } from './fixtures.js';

const ORG = '00000000-0000-7000-8000-000000000001';
const PIC = '00000000-0000-7000-8000-0000000000a1';
const base = { orgId: ORG, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdBy: null, deletedAt: null };
const prior = (id: string, source: string, flights: number, missions: number, flightSeconds: number, asOf: string, deletedAt: string | null = null) => ({ ...base, deletedAt, id, pilotId: PIC, source, flights, missions, flightSeconds, asOf, notes: null });

const snapshot = {
  organization: { id: ORG, name: 'Skyline', timezone: 'America/Denver', units: { length: 'ft', speed: 'mph', mass: 'lb', temperature: 'F' }, defaultJurisdiction: 'XX-TEST' },
  rulePack: testPack,
  overrides: [],
  pilots: [{ ...base, id: PIC, membershipId: null, displayName: 'Dana Reyes', email: null, phone: null, certificateNumber: '4760825', active: true }],
  credentials: [],
  priorExperience: [
    prior('00000000-0000-7000-8000-0000000000e1', 'DJI Fly', 100, 12, 20 * 3600, '2026-09-01'),
    prior('00000000-0000-7000-8000-0000000000e2', 'AirData', 20, 3, 5 * 3600 + 30 * 60, '2026-10-01'),
    prior('00000000-0000-7000-8000-0000000000e3', 'Removed', 999, 999, 999_999, '2026-10-02', '2026-10-03T00:00:00Z'),
  ],
  aircraft: [],
  batteries: [],
  insurancePolicies: [],
  maintenanceSchedules: [],
  pilotTotals: { [PIC]: { flights: 5, flightSeconds: 2 * 3600, lastFlightAt: '2026-10-10T16:00:00Z', last90DaysFlights: 5, missions: 2 } },
  batteryLastUsed: {},
  lastFlight: null,
  recentLocations: [],
  recentFlightCounts: { last7: 0, last30: 0 },
  generatedAt: '2026-10-17T16:00:00Z',
} as unknown as FleetSnapshot;

const ctx = { today: '2026-10-17', now: new Date('2026-10-17T16:00:00Z'), units: snapshot.organization.units, orgTimeZone: 'America/Denver' };

describe('prior experience', () => {
  it('adds entries to all-time totals, not the 90-day count, and ignores removed ones', () => {
    const d = buildPilotDetail({ snapshot, ctx, role: 'owner' }, PIC, []);
    expect(d.pilot!.totals).toMatchObject({ flights: 125, missions: 17, last90DaysFlights: 5 });
    expect(d.pilot!.totals.flightTime.value).toBe((2 + 20 + 5.5) * 3600);
    expect(d.pilot!.logged).toMatchObject({ flights: 5, missions: 2 });
    expect(d.pilot!.prior).toMatchObject({ flights: 120, missions: 15 });
    expect(d.priorExperience.map((x) => x.source)).toEqual(['AirData', 'DJI Fly']);
  });

  it('includes prior flight time in the pilot list', () => {
    const row = buildPilotList({ snapshot, ctx, role: 'owner' }).pilots[0]!;
    expect(row.totalFlightTime.value).toBe((2 + 20 + 5.5) * 3600);
  });

  it('shows prior experience to inspectors as a separate self-reported fact', () => {
    const packet = buildInspectorPacket(snapshot, { type: 'pilot', id: PIC }, [], ctx);
    expect(packet?.subject.facts).toContainEqual(['Prior experience (self-reported)', expect.stringMatching(/^120 flights · 25h 30m · from DJI Fly, AirData$/)]);
  });

  it('has no prior block without entries', () => {
    const d = buildPilotDetail({ snapshot: { ...snapshot, priorExperience: [] }, ctx, role: 'owner' }, PIC, []);
    expect(d.pilot!.prior).toBeNull();
    expect(d.pilot!.totals.flights).toBe(5);
  });
});
