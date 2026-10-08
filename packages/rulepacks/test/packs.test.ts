import { describe, expect, it } from 'vitest';
import { credentialExpiry, incidentReportability, resolveRulePack } from '@certa/core';
import { latestPack, loadAllPacks } from '../src/index.js';

describe('shipped rule packs', () => {
  const packs = loadAllPacks();

  it('all validate and include the US pack', () => {
    expect(packs.map((p) => p.pack.jurisdiction)).toContain('US-FAA-Part107');
  });

  it('every rule cites a source and is flagged for verification until verified', () => {
    for (const { pack } of packs)
      for (const r of pack.rules) {
        expect(r.source.citation.length, r.id).toBeGreaterThan(0);
        if (r.lastVerifiedOn === null) expect(r.needsVerification, r.id).toBe(true);
      }
  });

  it('US pack: recurrent training computes through end of 24th month', () => {
    const rules = resolveRulePack(latestPack('US-FAA-Part107'));
    const exp = credentialExpiry({ credentialType: 'part107_recurrent', issuedOn: '2025-03-14', expiresOn: null }, rules);
    expect(exp).toEqual({ expiresOn: '2027-03-31', basis: 'rule', ruleId: 'pilot.aeronautical_knowledge.recency' });
  });

  it('US pack: certificate does not expire', () => {
    const rules = resolveRulePack(latestPack('US-FAA-Part107'));
    expect(credentialExpiry({ credentialType: 'part107_certificate', issuedOn: '2020-01-01', expiresOn: null }, rules).basis).toBe('non_expiring');
  });

  it('US pack: $500 property damage is not reportable, $500.01 is, with a 10-day deadline', () => {
    const rules = resolveRulePack(latestPack('US-FAA-Part107'));
    const base = { maxInjuryAisLevel: 0, lossOfConsciousness: false, aircraftDamaged: true };
    expect(incidentReportability({ ...base, thirdPartyPropertyDamageCents: 50000 }, '2026-05-01', rules).status).toBe('not_reportable');
    const r = incidentReportability({ ...base, thirdPartyPropertyDamageCents: 50001 }, '2026-05-01', rules);
    expect(r.status).toBe('reportable');
    expect(r.deadline).toBe('2026-05-11');
  });
});
