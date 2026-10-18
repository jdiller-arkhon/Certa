import { describe, expect, it } from 'vitest';
import { conditionsCheck, withCheck, type Advisory, type GoNoGoResult } from '../src/index.js';

const adv = (level: Advisory['level'], title: string, source = 'FAA TFR service'): Advisory => ({ key: title, level, title, detail: '', source });
const go: GoNoGoResult = { decision: 'go', checks: [{ key: 'pilot', label: 'Pilot', level: 'green', detail: 'Current' }] };

describe('conditions in the go / no-go verdict', () => {
  it('turns Go into No-go for a red advisory, naming it', () => {
    const c = conditionsCheck([adv('green', 'No active TFRs here'), adv('red', 'Inside a TFR: Stadium'), adv('amber', 'Strong wind')]);
    expect(c).toMatchObject({ key: 'conditions', level: 'red', detail: 'Inside a TFR: Stadium' });
    expect(withCheck(go, c).decision).toBe('no_go');
  });

  it('is Caution for amber, and ignores standing reminders like "Check NOTAMs"', () => {
    expect(withCheck(go, conditionsCheck([adv('amber', 'Strong wind'), adv('amber', 'Night or twilight')])).decision).toBe('caution');
    const clear = conditionsCheck([adv('green', 'Weather within typical limits'), adv('amber', 'Check NOTAMs', 'Reminder')]);
    expect(clear.level).toBe('green');
    expect(withCheck(go, clear).decision).toBe('go');
  });

  it('is Caution when conditions were not checked', () => {
    expect(conditionsCheck(null).level).toBe('amber');
    expect(withCheck(go, conditionsCheck(null)).decision).toBe('caution');
  });

  it('replaces an earlier conditions row instead of adding a second', () => {
    const once = withCheck(withCheck(go, conditionsCheck(null)), conditionsCheck([adv('green', 'Clear')]));
    expect(once.checks.filter((c) => c.key === 'conditions')).toHaveLength(1);
    expect(once.decision).toBe('go');
  });
});
