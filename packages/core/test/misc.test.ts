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

import { ruleEditorFor, ruleEditorValueToSI } from '../src/index.js';
describe('rule override editor units', () => {
  it('round-trips through display units', () => {
    const us = DEFAULT_UNITS_US;
    expect(ruleEditorFor('length', 121.92, us)).toEqual({ input: 'number', unit: 'ft', value: 400, step: 1 });
    expect(ruleEditorValueToSI('length', 300, us)).toBeCloseTo(91.44);
    expect(ruleEditorFor('money', 50000, us)).toMatchObject({ value: 500, unit: 'USD' });
    expect(ruleEditorValueToSI('money', '750.5', us)).toBe(75050);
    expect(ruleEditorValueToSI('speed', 100, us)).toBeCloseTo(44.704);
  });
});

import { airframeOf } from '../src/index.js';
describe('airframe from make and model', () => {
  it('recognizes common non-quad airframes and defaults to quad', () => {
    expect(airframeOf({ make: 'DJI', model: 'Matrice 30T' })).toBe('quad');
    expect(airframeOf({ make: 'Skydio', model: 'X10' })).toBe('quad');
    expect(airframeOf({ make: 'DJI', model: 'Matrice 600 Pro' })).toBe('hex');
    expect(airframeOf({ make: 'Freefly', model: 'Alta 8' })).toBe('octo');
    expect(airframeOf({ make: 'Quantum Systems', model: 'Trinity F90+' })).toBe('fixed_wing_vtol');
    expect(airframeOf({ make: 'Wingtra', model: 'WingtraOne Gen II' })).toBe('fixed_wing_vtol');
  });
});
