import { describe, expect, it } from 'vitest';
import { crossedThreshold, evaluateItem, pilotCredentialItems, resolveRulePack, summarize, type ExpiringItem } from '../src/index.js';
import { testPack } from './fixtures.js';

const item = (over: Partial<ExpiringItem>): ExpiringItem => ({
  kind: 'credential', subjectType: 'pilot', subjectId: 'p1', key: 'k', label: 'Recurrent', dueOn: null, usageFraction: null, blocking: false, ruleId: null, ...over,
});

describe('readiness', () => {
  it('classifies by date with an inclusive last valid day', () => {
    expect(evaluateItem(item({ dueOn: '2026-10-08' }), '2026-10-08').level).toBe('amber');
    expect(evaluateItem(item({ dueOn: '2026-10-07' }), '2026-10-08').level).toBe('red');
    expect(evaluateItem(item({ dueOn: '2026-11-07' }), '2026-10-08').level).toBe('amber');
    expect(evaluateItem(item({ dueOn: '2026-11-08' }), '2026-10-08').level).toBe('green');
  });

  it('classifies usage and blockers', () => {
    expect(evaluateItem(item({ usageFraction: 0.95 }), '2026-10-08').level).toBe('amber');
    expect(evaluateItem(item({ usageFraction: 1 }), '2026-10-08').level).toBe('red');
    expect(evaluateItem(item({ blocking: true }), '2026-10-08').level).toBe('red');
  });

  it('summarizes worst-first', () => {
    const s = summarize([item({ key: 'a', dueOn: '2026-10-20' }), item({ key: 'b', dueOn: '2026-01-01' }), item({ key: 'c', dueOn: '2030-01-01' })], '2026-10-08');
    expect(s.level).toBe('red');
    expect(s.reasons.map((r) => r.key)).toEqual(['b', 'a']);
  });

  it('flags missing required credentials and counts only the newest satisfying credential', () => {
    const rules = resolveRulePack(testPack);
    const missing = pilotCredentialItems('p1', [], rules);
    expect(missing.filter((i) => i.kind === 'credential_missing').map((i) => i.label)).toEqual(['Certificate not on file', 'Recurrent not on file']);

    const items = pilotCredentialItems('p1', [
      { id: 'c1', credentialType: 'cert', issuedOn: '2020-01-01', expiresOn: null },
      { id: 'c2', credentialType: 'initial', issuedOn: '2022-01-10', expiresOn: null },
      { id: 'c3', credentialType: 'recurrent', issuedOn: '2025-06-01', expiresOn: null },
    ], rules);
    expect(items.find((i) => i.kind === 'credential_missing')).toBeUndefined();
    const recency = items.filter((i) => i.ruleId === 'pilot.recency');
    expect(recency).toHaveLength(1);
    expect(recency[0]!.dueOn).toBe('2027-06-30');
    expect(summarize(items, '2026-10-08').level).toBe('green');
  });

  it('finds the alert threshold crossed', () => {
    expect(crossedThreshold(100)).toBeNull();
    expect(crossedThreshold(90)).toBe(90);
    expect(crossedThreshold(29)).toBe(30);
    expect(crossedThreshold(3)).toBe(7);
  });
});
