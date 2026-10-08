import { describe, expect, it } from 'vitest';
import { credentialExpiry, getRule, resolveRulePack, validateRulePack } from '../src/index.js';
import { testPack, testPackInput } from './fixtures.js';

describe('rule engine', () => {
  it('rejects duplicate ids and dangling references', () => {
    expect(() => validateRulePack({ ...testPackInput, rules: [...testPackInput.rules, testPackInput.rules[0]] })).toThrow(/duplicate rule id/);
    expect(() =>
      validateRulePack({
        ...testPackInput,
        credentialTypes: [{ id: 'x', label: 'x', description: 'x', validityRuleId: 'nope.nope', requiredForCurrency: false }],
      }),
    ).toThrow(/missing rule/);
    expect(() =>
      validateRulePack({
        ...testPackInput,
        credentialTypes: [{ id: 'x', label: 'x', description: 'x', validityRuleId: 'operation.max_altitude', requiredForCurrency: false }],
      }),
    ).toThrow(/must be kind=duration/);
  });

  it('applies org overrides and keeps the pack value', () => {
    const r = resolveRulePack(testPack, [{ ruleId: 'operation.max_altitude', value: 100, reason: 'Company SOP' }]);
    const rule = getRule(r, 'operation.max_altitude', 'length');
    expect(rule.value).toBe(100);
    expect(rule.packValue).toBe(121.92);
    expect(rule.override?.reason).toBe('Company SOP');
  });

  it('rejects overrides of the wrong kind or unknown rule', () => {
    expect(() => resolveRulePack(testPack, [{ ruleId: 'operation.max_altitude', value: 'high', reason: 'x' }])).toThrow(/not a valid length/);
    expect(() => resolveRulePack(testPack, [{ ruleId: 'nope.x', value: 1, reason: 'x' }])).toThrow(/unknown rule/);
  });

  it('override of a duration changes computed credential expiry', () => {
    const r = resolveRulePack(testPack, [{ ruleId: 'pilot.recency', value: { amount: 12, unit: 'months', roundTo: 'end_of_month' }, reason: 'Stricter SOP' }]);
    expect(credentialExpiry({ credentialType: 'recurrent', issuedOn: '2025-03-14', expiresOn: null }, r).expiresOn).toBe('2026-03-31');
  });

  it('explicit expiry wins over rule; unknown types are flagged', () => {
    const r = resolveRulePack(testPack);
    expect(credentialExpiry({ credentialType: 'recurrent', issuedOn: '2025-03-14', expiresOn: '2025-12-01' }, r)).toMatchObject({ expiresOn: '2025-12-01', basis: 'explicit' });
    expect(credentialExpiry({ credentialType: 'mystery', issuedOn: '2025-03-14', expiresOn: null }, r).basis).toBe('unknown');
  });
});
