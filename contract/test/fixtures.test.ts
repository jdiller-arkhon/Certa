import { describe, expect, it } from 'vitest';
import { scenarios } from '../fixtures/index.ts';

describe('contract fixtures', () => {
  it('cover the required scenarios', () => {
    expect(Object.keys(scenarios).sort()).toEqual(['company', 'empty', 'expired', 'large', 'longNames', 'solo']);
  });
  it('large has 500+ flights', () => {
    expect(scenarios.large!.screens.flightList.flights.items.length).toBeGreaterThanOrEqual(500);
  });
  it('expired has no green pilots or aircraft', () => {
    expect(scenarios.expired!.screens.readinessDashboard.counts.green).toBe(0);
  });
  it('company spans green, amber, and red', () => {
    const c = scenarios.company!.screens.readinessDashboard.counts;
    expect(c.green && c.amber && c.red).toBeTruthy();
  });
  it('empty has empty lists', () => {
    const s = scenarios.empty!.screens;
    expect(s.pilotList.pilots).toHaveLength(0);
    expect(s.aircraftList.aircraft).toHaveLength(0);
    expect(s.flightList.flights.items).toHaveLength(0);
  });
  it('every shell carries the compliance notice', () => {
    for (const s of Object.values(scenarios)) expect(s.shell.complianceNotice).toMatch(/record-keeping tool/);
  });
});
