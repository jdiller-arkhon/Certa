import { describe, expect, it } from 'vitest';
import { addMonths, applyDuration, dateInZone, daysBetween, displayDate, displayInstant, endOfMonth } from '../src/index.js';

describe('dates', () => {
  it('adds months clamping to month end', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
    expect(endOfMonth('2026-02-03')).toBe('2026-02-28');
  });

  it('applies calendar-month durations', () => {
    expect(applyDuration('2025-03-14', { amount: 24, unit: 'months', roundTo: 'end_of_month' })).toBe('2027-03-31');
    expect(applyDuration('2025-03-14', { amount: 3, unit: 'years', roundTo: 'none' })).toBe('2028-03-14');
    expect(applyDuration('2025-12-25', { amount: 10, unit: 'days', roundTo: 'none' })).toBe('2026-01-04');
  });

  it('counts days across DST and leap days', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9);
  });

  it('shows absolute plus relative', () => {
    expect(displayDate('2027-03-14', '2027-02-19').display).toBe('Mar 14, 2027 — in 23 days');
    expect(displayDate('2027-03-14', '2027-03-14').relative).toBe('today');
    expect(displayDate('2027-03-10', '2027-03-14').relative).toBe('4 days ago');
  });

  it('displays instants in the flight location zone', () => {
    // 2026-07-01T03:30Z is still June 30 in Denver.
    expect(dateInZone('2026-07-01T03:30:00Z', 'America/Denver')).toBe('2026-06-30');
    const d = displayInstant('2026-07-01T03:30:00Z', 'America/Denver', new Date('2026-07-01T12:00:00Z'));
    expect(d.absolute).toContain('Jun 30, 2026');
    expect(d.absolute).toContain('MDT');
    expect(d.relative).toBe('yesterday');
  });
});
