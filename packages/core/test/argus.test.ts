import { describe, expect, it } from 'vitest';
import { buildPilotDetail, type FleetSnapshot } from '../src/index.js';
import { testPack } from './fixtures.js';

const ORG = '00000000-0000-7000-8000-000000000001';
const PIC = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const base = { orgId: ORG, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdBy: null, deletedAt: null };
const ext = (id: string, pilotId: string, takeoffAt: string, durationSeconds: number, reference: string | null) => ({
  ...base,
  id,
  pilotId,
  source: 'argus',
  externalId: id,
  reference,
  takeoffAt,
  landingAt: takeoffAt,
  durationSeconds,
  locationName: 'Boulder, CO',
});
const pilot = (id: string, name: string) => ({ ...base, id, membershipId: null, displayName: name, email: null, phone: null, certificateNumber: null, active: true });

const snapshot = {
  organization: { id: ORG, name: 'Skyline', timezone: 'America/Denver', units: { length: 'ft', speed: 'mph', mass: 'lb', temperature: 'F' }, defaultJurisdiction: 'XX-TEST' },
  rulePack: testPack,
  overrides: [],
  pilots: [pilot(PIC, 'Dana Reyes'), pilot(OTHER, 'Sam Other')],
  credentials: [],
  priorExperience: [],
  externalFlights: [
    ext('00000000-0000-7000-8000-0000000000f1', PIC, '2026-10-01T16:00:00Z', 1200, 'Argus job #1041'),
    ext('00000000-0000-7000-8000-0000000000f2', PIC, '2026-10-12T16:00:00Z', 1800, null),
    ext('00000000-0000-7000-8000-0000000000f3', OTHER, '2026-10-12T16:00:00Z', 600, 'Argus job #9'),
  ],
  aircraft: [
    { ...base, id: '00000000-0000-7000-8000-0000000000c1', nickname: 'Hawk', make: 'DJI', model: 'Mavic 3E', serialNumber: 'S1', status: 'active' },
    { ...base, id: '00000000-0000-7000-8000-0000000000c2', nickname: null, make: 'DJI', model: 'Phantom 4', serialNumber: 'S2', status: 'retired' },
  ],
  batteries: [],
  insurancePolicies: [],
  maintenanceSchedules: [],
  // The API already folds Argus flights into the totals.
  pilotTotals: { [PIC]: { flights: 4, flightSeconds: 3600 + 3000, lastFlightAt: '2026-10-12T16:00:00Z', last90DaysFlights: 4, missions: 3 } },
  batteryLastUsed: {},
  lastFlight: null,
  recentLocations: [],
  recentFlightCounts: { last7: 0, last30: 0 },
  generatedAt: '2026-10-17T16:00:00Z',
} as unknown as FleetSnapshot;

const ctx = { today: '2026-10-17', now: new Date('2026-10-17T16:00:00Z'), units: snapshot.organization.units, orgTimeZone: 'America/Denver' };

describe('Argus mission flights on the pilot page', () => {
  it('lists the pilot’s own, newest first, with the drones that can be picked', () => {
    const d = buildPilotDetail({ snapshot, ctx, role: 'owner' }, PIC, []);
    expect(d.argusFlights.map((x) => x.reference)).toEqual(['Argus mission', 'Argus job #1041']);
    expect(d.argusFlights[1]).toMatchObject({ location: 'Boulder, CO', flightTime: expect.objectContaining({ value: 1200 }) });
    expect(d.pilot!.argus).toMatchObject({ flights: 2, flightTime: expect.objectContaining({ value: 3000 }) });
    expect(d.pilot!.totals).toMatchObject({ flights: 4, missions: 3 });
    expect(d.aircraftOptions).toEqual([{ value: '00000000-0000-7000-8000-0000000000c1', label: expect.stringContaining('Hawk') }]);
    expect(d.canConvertArgus).toBe(true);
  });

  it('lets pilots pick the drone for their own flights only', () => {
    expect(buildPilotDetail({ snapshot, ctx, role: 'pilot' }, PIC, [], { ownPilotId: PIC }).canConvertArgus).toBe(true);
    expect(buildPilotDetail({ snapshot, ctx, role: 'pilot' }, OTHER, [], { ownPilotId: PIC }).canConvertArgus).toBe(false);
    expect(buildPilotDetail({ snapshot, ctx, role: 'viewer' }, PIC, []).canConvertArgus).toBe(false);
  });

  it('has no Argus block without flights', () => {
    const d = buildPilotDetail({ snapshot: { ...snapshot, externalFlights: [] }, ctx, role: 'owner' }, PIC, []);
    expect(d.pilot!.argus).toBeNull();
    expect(d.argusFlights).toEqual([]);
  });
});
