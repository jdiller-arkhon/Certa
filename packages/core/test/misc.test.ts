import { describe, expect, it } from 'vitest';
import { can, canonicalJson, contentHash, formatLength, formatSpeed, DEFAULT_UNITS_US, ledgerEntryHash, GENESIS_HASH, newId, toMetres } from '../src/index.js';

describe('permissions', () => {
  it('pilots may only edit their own flights', () => {
    expect(can('pilot', 'flights.edit', { actorPilotId: 'a', resourcePilotId: 'a' })).toBe(true);
    expect(can('pilot', 'flights.edit', { actorPilotId: 'a', resourcePilotId: 'b' })).toBe(false);
    expect(can('chief_pilot', 'flights.edit', { actorPilotId: 'a', resourcePilotId: 'b' })).toBe(true);
  });
  it('viewers and auditors are read-only; only owners bill', () => {
    expect(can('viewer', 'flights.log')).toBe(false);
    expect(can('auditor', 'aircraft.manage')).toBe(false);
    expect(can('auditor', 'integrity.verify')).toBe(true);
    expect(can('admin', 'org.billing')).toBe(false);
    expect(can('owner', 'org.billing')).toBe(true);
    expect(can('admin', 'rules.override')).toBe(true);
    expect(can('chief_pilot', 'rules.override')).toBe(false);
  });
});

describe('hashing', () => {
  it('canonicalizes key order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(contentHash({ b: 1, a: 2 })).toBe(contentHash({ a: 2, b: 1 }));
  });
  it('chains entries', () => {
    const link = { orgId: 'o', seq: 1, entityType: 'flight', entityId: 'f', entityVersion: 1, contentHash: contentHash({ x: 1 }), prevHash: GENESIS_HASH, at: '2026-01-01T00:00:00Z' };
    const h = ledgerEntryHash(link);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(ledgerEntryHash({ ...link, contentHash: contentHash({ x: 2 }) })).not.toBe(h);
  });
});

describe('units & ids', () => {
  it('converts SI for display', () => {
    expect(formatLength(121.92, DEFAULT_UNITS_US).display).toBe('400 ft');
    expect(formatSpeed(44.704, DEFAULT_UNITS_US).display).toBe('100 mph');
    expect(toMetres(400, 'ft')).toBeCloseTo(121.92);
  });
  it('generates time-ordered uuid v7', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
  });
});
