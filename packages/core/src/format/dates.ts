/**
 * Date handling. Calendar dates are `YYYY-MM-DD` strings with no time zone; instants are
 * UTC ISO strings. Display always shows the absolute value plus relative time:
 * "Mar 14, 2027 — in 23 days".
 */

const DAY_MS = 86_400_000;

export function parseIsoDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function formatIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Adds whole months, clamping to the last day of the target month (Jan 31 + 1M = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parseIsoDate(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatIsoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Last day of the month that contains `date`. */
export function endOfMonth(date: string): string {
  const { y, m } = parseIsoDate(date);
  return formatIsoDate(y, m, daysInMonth(y, m));
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseIsoDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return formatIsoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS,
  );
}

/** The calendar date of an instant as observed in a time zone. */
export function dateInZone(instant: Date | string, timeZone: string): string {
  const dt = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Display-ready date handed to presentational components. */
export interface DateDisplay {
  /** Machine value: YYYY-MM-DD or full ISO instant. */
  iso: string;
  /** "Mar 14, 2027" or "Mar 14, 2027, 2:05 PM MST". */
  absolute: string;
  /** "in 23 days", "today", "3 days ago". */
  relative: string;
  /** "Mar 14, 2027 — in 23 days". */
  display: string;
  /** Signed whole days from today (negative = past). */
  daysFromToday: number;
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const abs = Math.abs(days);
  let text: string;
  if (abs < 60) text = `${abs} days`;
  else if (abs < 730) text = `${Math.round(abs / 30.44)} months`;
  else text = `${(abs / 365.25).toFixed(1).replace(/\.0$/, '')} years`;
  return days > 0 ? `in ${text}` : `${text} ago`;
}

/** Formats a calendar date relative to `today` (YYYY-MM-DD in the viewer's zone). */
export function displayDate(date: string, today: string, locale = 'en-US'): DateDisplay {
  const { y, m, d } = parseIsoDate(date);
  const absolute = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
  const days = daysBetween(today, date);
  const relative = relativeDays(days);
  return { iso: date, absolute, relative, display: `${absolute} — ${relative}`, daysFromToday: days };
}

/** Formats an instant in a specific IANA zone (e.g. the flight location's zone). */
export function displayInstant(
  iso: string,
  timeZone: string,
  now: Date,
  locale = 'en-US',
): DateDisplay {
  const dt = new Date(iso);
  const absolute = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(dt);
  const days = daysBetween(dateInZone(now, timeZone), dateInZone(dt, timeZone));
  const relative = relativeDays(days);
  return { iso, absolute, relative, display: `${absolute} — ${relative}`, daysFromToday: days };
}
