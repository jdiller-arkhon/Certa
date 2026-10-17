import { describe, expect, it } from 'vitest';
import { missionReadiness, type FleetSnapshot, type MissionAuthorization, type MissionPlan } from '../src/index.js';
import { testPack } from './fixtures.js';

const ORG = '00000000-0000-7000-8000-000000000001';
const base = { orgId: ORG, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdBy: null, deletedAt: null };
const PIC = '00000000-0000-7000-8000-0000000000a1';
const VO = '00000000-0000-7000-8000-0000000000b2';
const AC = '00000000-0000-7000-8000-0000000000c3';
const cred = (id: string, credentialType: string, issuedOn: string, expiresOn: string | null = null) => ({ ...base, id, pilotId: PIC, credentialType, jurisdiction: 'XX-TEST', identifier: null, issuedOn, expiresOn, notes: null, documentIds: [] });

const snapshot = {
  organization: { id: ORG, name: 'Skyline', timezone: 'America/Denver', units: { length: 'ft', speed: 'mph', mass: 'lb', temperature: 'F' }, defaultJurisdiction: 'XX-TEST' },
  rulePack: testPack,
  overrides: [],
  pilots: [
    { ...base, id: PIC, membershipId: null, displayName: 'Dana Reyes', email: null, phone: null, certificateNumber: '4760825', active: true },
    { ...base, id: VO, membershipId: null, displayName: 'Sam Ortiz', email: null, phone: null, certificateNumber: null, active: true },
  ],
  // Recurrent training (24 months, to the end of the month) runs out on 2026-11-30.
  credentials: [cred('00000000-0000-7000-8000-0000000000d1', 'cert', '2020-01-01'), cred('00000000-0000-7000-8000-0000000000d2', 'recurrent', '2024-11-10')],
  aircraft: [{ ...base, id: AC, nickname: 'M30 #1', make: 'DJI', model: 'Matrice 30T', serialNumber: 'M30-1', registrationNumber: 'FA3XXXX', registrationExpiresOn: '2028-01-01', remoteIdMethod: 'standard', remoteIdSerial: null, takeoffMassKg: 3.8, firmwareVersion: null, status: 'active', groundedReason: null, totalFlightSeconds: 0, totalFlights: 0 }],
  batteries: [],
  insurancePolicies: [],
  maintenanceSchedules: [],
  pilotTotals: {},
  batteryLastUsed: {},
  lastFlight: null,
  recentLocations: [],
  recentFlightCounts: { last7: 0, last30: 0 },
  generatedAt: '2026-10-17T16:00:00Z',
} as unknown as FleetSnapshot;

const ctx = { today: '2026-10-17', now: new Date('2026-10-17T16:00:00Z'), units: snapshot.organization.units, orgTimeZone: 'America/Denver' };
const plan = (p: Partial<MissionPlan> = {}): MissionPlan => ({
  plannedStart: '2026-10-22T15:00:00Z',
  plannedEnd: '2026-10-22T17:30:00Z',
  status: 'planned',
  crew: [{ pilotId: PIC, role: 'pic' }, { pilotId: VO, role: 'observer' }],
  aircraftIds: [AC],
  authorizationIds: [],
  location: { lat: 39.86, lon: -104.67 },
  maxAltitudeAglM: 60,
  ...p,
});
const auth = (a: Partial<MissionAuthorization>): MissionAuthorization => ({ id: '00000000-0000-7000-8000-0000000000e1', kind: 'laanc', reference: 'LAANC-1', validFrom: null, validTo: null, pilotId: null, deletedAt: null, ...a });
const check = (r: ReturnType<typeof missionReadiness>, key: string) => r.checks.find((c) => c.key === key);

describe('mission readiness', () => {
  it('is ready when the crew, aircraft, window and place are set', () => {
    const r = missionReadiness(snapshot, plan(), [], ctx);
    expect(r.level).not.toBe('red');
    expect(check(r, `crew:${VO}`)?.level).toBe('green'); // observers need no certificate
  });

  it('judges credentials on the mission date, not today', () => {
    const r = missionReadiness(snapshot, plan({ plannedStart: '2026-12-10T15:00:00Z', plannedEnd: '2026-12-10T17:00:00Z' }), [], ctx);
    expect(check(r, `crew:${PIC}`)?.level).toBe('red');
    expect(r.label).toBe('Not ready');
  });

  it('flags a missing pilot in command, aircraft, date and location', () => {
    const r = missionReadiness(snapshot, plan({ crew: [{ pilotId: VO, role: 'observer' }], aircraftIds: [], plannedStart: null, plannedEnd: null, location: null }), [], ctx);
    expect(check(r, 'pic')?.level).toBe('red');
    expect(check(r, 'aircraft')?.level).toBe('red');
    expect(check(r, 'window')?.level).toBe('amber');
    expect(check(r, 'location')?.level).toBe('amber');
  });

  it('checks authorizations cover the window and the crew', () => {
    const ends = auth({ validFrom: '2026-10-22T14:00:00Z', validTo: '2026-10-22T16:00:00Z' });
    expect(check(missionReadiness(snapshot, plan({ authorizationIds: [ends.id] }), [ends], ctx), `auth:${ends.id}`)).toMatchObject({ level: 'red', detail: 'Expires before the mission ends' });
    const late = auth({ validFrom: '2026-10-22T16:00:00Z' });
    expect(check(missionReadiness(snapshot, plan({ authorizationIds: [late.id] }), [late], ctx), `auth:${late.id}`)?.level).toBe('red');
    const someoneElse = auth({ pilotId: '00000000-0000-7000-8000-0000000000f9' });
    expect(check(missionReadiness(snapshot, plan({ authorizationIds: [someoneElse.id] }), [someoneElse], ctx), `auth:${someoneElse.id}`)?.level).toBe('amber');
    const fine = auth({ validFrom: '2026-10-22T14:00:00Z', validTo: '2026-10-22T18:00:00Z', pilotId: PIC });
    expect(check(missionReadiness(snapshot, plan({ authorizationIds: [fine.id] }), [fine], ctx), `auth:${fine.id}`)?.level).toBe('green');
  });

  it('warns above 400 ft AGL unless a waiver is attached', () => {
    expect(check(missionReadiness(snapshot, plan({ maxAltitudeAglM: 150 }), [], ctx), 'altitude')?.level).toBe('amber');
    const w = auth({ kind: 'waiver', reference: '107W-1' });
    expect(check(missionReadiness(snapshot, plan({ maxAltitudeAglM: 150, authorizationIds: [w.id] }), [w], ctx), 'altitude')?.level).toBe('green');
    expect(check(missionReadiness(snapshot, plan({ maxAltitudeAglM: 121.92 }), [], ctx), 'altitude')).toBeUndefined();
  });
});
