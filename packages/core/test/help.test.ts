import { describe, expect, it } from 'vitest';
import { buildGettingStarted, glossary, GLOSSARY, type FleetSnapshot } from '../src/index.js';
import { testPack } from './fixtures.js';

const ORG = '00000000-0000-7000-8000-000000000001';
const base = { orgId: ORG, createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z', createdBy: null, deletedAt: null };
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const ME = id(1);
const OTHER = id(2);
const cred = (n: number, pilotId: string, credentialType: string) => ({ ...base, id: id(n), pilotId, credentialType, jurisdiction: 'XX-TEST', identifier: null, issuedOn: '2025-06-01', expiresOn: null, notes: null, documentIds: [] });

function snapshot(over: Partial<Record<'credentials' | 'aircraft' | 'pilotTotals', unknown>> = {}): FleetSnapshot {
  return { rulePack: testPack, credentials: [], aircraft: [], pilotTotals: {}, lastFlight: null, ...over } as unknown as FleetSnapshot;
}

describe('getting started', () => {
  it('has nothing for members without a pilot record', () => {
    expect(buildGettingStarted(snapshot(), null)).toBeNull();
  });

  it('starts with every step open, pointing at the right screens', () => {
    const g = buildGettingStarted(snapshot(), ME)!;
    expect(g.steps.map((s) => [s.id, s.done, s.href])).toEqual([
      ['certificate', false, `/pilots/${ME}#credentials`],
      ['recurrent', false, `/pilots/${ME}#credentials`],
      ['aircraft', false, '/aircraft/new'],
      ['flight', false, '/flights/new'],
    ]);
    expect(g).toMatchObject({ doneCount: 0, complete: false });
  });

  it('ticks steps from the pilot’s own records only', () => {
    const s = snapshot({
      credentials: [cred(10, ME, 'cert'), cred(11, OTHER, 'recurrent'), { ...cred(12, ME, 'recurrent'), deletedAt: '2026-02-01T00:00:00Z' }],
      aircraft: [{ ...base, id: id(20) }],
    });
    const g = buildGettingStarted(s, ME)!;
    expect(g.steps.filter((x) => x.done).map((x) => x.id)).toEqual(['certificate', 'aircraft']);
    expect(g.doneCount).toBe(2);
  });

  it('is complete once the first flight is logged', () => {
    const s = snapshot({
      credentials: [cred(10, ME, 'cert'), cred(11, ME, 'recurrent')],
      aircraft: [{ ...base, id: id(20) }],
      pilotTotals: { [ME]: { flights: 1, flightSeconds: 600, lastFlightAt: null, last90DaysFlights: 1, missions: 0 } },
    });
    expect(buildGettingStarted(s, ME)).toMatchObject({ doneCount: 4, complete: true });
  });

  it('defines every glossary term once', () => {
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    expect(glossary('tfr')?.term).toBe('TFR');
    expect(glossary('nope')).toBeUndefined();
  });
});
