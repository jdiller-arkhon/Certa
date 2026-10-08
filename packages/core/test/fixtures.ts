import { validateRulePack, type RulePackInput } from '../src/index.js';

const src = { title: 'Test', citation: 'T 1.1', url: null };

export const testPackInput: RulePackInput = {
  schemaVersion: 1,
  jurisdiction: 'XX-TEST',
  version: '1.0.0',
  name: 'Test pack',
  authority: 'Test authority',
  effectiveFrom: '2020-01-01',
  disclaimer: 'Test only',
  credentialTypes: [
    { id: 'cert', label: 'Certificate', description: 'd', validityRuleId: null, requiredForCurrency: true },
    { id: 'initial', label: 'Initial test', description: 'd', validityRuleId: 'pilot.recency', requiredForCurrency: false },
    { id: 'recurrent', label: 'Recurrent', description: 'd', validityRuleId: 'pilot.recency', requiredForCurrency: true, satisfiedBy: ['initial'] },
  ],
  rules: [
    { id: 'pilot.recency', title: 't', description: 'd', appliesTo: 'pilot', kind: 'duration', value: { amount: 24, unit: 'months', roundTo: 'end_of_month' }, source: src, lastVerifiedOn: null, needsVerification: true },
    { id: 'operation.max_altitude', title: 't', description: 'd', appliesTo: 'operation', kind: 'length', value: 121.92, unit: 'm', source: src, lastVerifiedOn: null, needsVerification: true },
  ],
};
export const testPack = validateRulePack(testPackInput);
