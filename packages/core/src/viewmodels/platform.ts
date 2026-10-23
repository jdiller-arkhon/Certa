/**
 * View-models for the Arkhon platform console (/platform). Builders turn the platform API's
 * responses into display-ready props, so console screens never format dates or durations.
 */
import type {
  Announcement,
  PilotHelpFlag,
  PlatformActivityResponse,
  PlatformComplianceItem,
  PlatformMonth,
  PlatformOverviewResponse,
  PlatformPilotDetail,
  PlatformPilotRow,
} from '../api/schemas.js';
import type { ReadinessLevel, Role } from '../domain/enums.js';
import { ROLE_LABELS } from '../domain/permissions.js';
import { addDays, displayDate, displayInstant } from '../format/dates.js';
import { HELP_FLAG_LABEL, HELP_FLAG_ORDER, PLATFORM_EXPORT_INFO } from '../platform/console.js';
import type { StatusBadge } from './common.js';
import { initials } from './mappers.js';

export type LoadState = 'loading' | 'ready' | 'error';

/** Console times are shown in Arkhon's home time zone. */
export const PLATFORM_TIME_ZONE = 'America/Denver';

export interface PlatformPeriodVM {
  from: string;
  to: string;
  label: string;
  preset: PlatformPeriodPreset | 'custom';
}
export type PlatformPeriodPreset = '30d' | '90d' | 'ytd' | '12m';
export const PLATFORM_PERIOD_PRESETS: { id: PlatformPeriodPreset; label: string }[] = [
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: '12m', label: '12 months' },
];

export function platformPresetRange(preset: PlatformPeriodPreset, today: string): { from: string; to: string } {
  switch (preset) {
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case '12m':
      return { from: addDays(today, -364), to: today };
  }
}

export function platformPeriod(from: string, to: string, today: string): PlatformPeriodVM {
  const preset = PLATFORM_PERIOD_PRESETS.find((p) => {
    const r = platformPresetRange(p.id, today);
    return r.from === from && r.to === to;
  });
  const fmt = (d: string) => displayDate(d, today).absolute;
  return { from, to, label: preset ? PLATFORM_PERIOD_PRESETS.find((p) => p.id === preset.id)!.label : `${fmt(from)} – ${fmt(to)}`, preset: preset?.id ?? 'custom' };
}

/** "12.5 h" — console figures are in decimal hours, like the exports. */
export const hoursText = (seconds: number) => {
  const h = seconds / 3600;
  return `${h >= 100 ? Math.round(h).toLocaleString('en-US') : h.toFixed(1)} h`;
};
const count = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

export const HELP_FLAG_LEVEL: Record<PilotHelpFlag, ReadinessLevel> = {
  recurrent_overdue: 'red',
  not_cleared: 'red',
  no_certificate: 'red',
  recurrent_due_soon: 'amber',
  never_signed_in: 'amber',
  argus_waiting: 'amber',
  inactive_90d: 'amber',
};

export interface HelpFlagVM {
  id: PilotHelpFlag;
  label: string;
  level: ReadinessLevel;
}
const flagVM = (id: PilotHelpFlag): HelpFlagVM => ({ id, label: HELP_FLAG_LABEL[id], level: HELP_FLAG_LEVEL[id] });

const LEVEL_TEXT: Record<ReadinessLevel, string> = { green: 'Cleared', amber: 'Attention', red: 'Not cleared' };

// ---------------------------------------------------------------- overview

export interface PlatformKpiVM {
  id: string;
  label: string;
  value: string;
  hint: string | null;
  level: ReadinessLevel | null;
  href: string | null;
}

export interface PlatformChartMonthVM {
  key: string;
  label: string;
  longLabel: string;
  hours: number;
  hoursDisplay: string;
  flights: number;
  pilotsFlown: number;
  argusFlights: number;
  inPeriod: boolean;
}

export interface PlatformOverviewScreenProps {
  state: LoadState;
  error: string | null;
  period: PlatformPeriodVM;
  presets: typeof PLATFORM_PERIOD_PRESETS;
  generatedAt: string | null;
  /** Fleet-wide state right now. */
  kpis: PlatformKpiVM[];
  /** Activity in the selected period. */
  periodStats: PlatformKpiVM[];
  readiness: { level: ReadinessLevel; label: string; count: number; share: number }[];
  months: PlatformChartMonthVM[];
  topPilots: { key: string; name: string; initials: string; orgName: string; hours: string; flights: string; href: string }[];
  organizations: { id: string; name: string; pilots: number; aircraft: number; flights: string; hours: string; readiness: Record<ReadinessLevel, number> }[];
  onPreset: (preset: PlatformPeriodPreset) => void;
  onCustom: (from: string, to: string) => void;
  onNavigate: (href: string) => void;
  onDownload: (dataset: string) => void;
  downloading: string | null;
  onRetry: () => void;
}

export function platformMonths(months: PlatformMonth[], period?: { from: string; to: string }): PlatformChartMonthVM[] {
  return months.map((m) => {
    const d = new Date(`${m.month}-15T00:00:00Z`);
    return {
      key: m.month,
      label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d),
      longLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d),
      hours: Math.round((m.flightSeconds / 3600) * 10) / 10,
      hoursDisplay: hoursText(m.flightSeconds),
      flights: m.flights,
      pilotsFlown: m.pilotsFlown,
      argusFlights: m.argusFlights,
      inPeriod: !period || (m.month >= period.from.slice(0, 7) && m.month <= period.to.slice(0, 7)),
    };
  });
}

export function buildPlatformOverview(o: PlatformOverviewResponse, now: Date): Omit<PlatformOverviewScreenProps, 'state' | 'error' | 'presets' | 'onPreset' | 'onCustom' | 'onNavigate' | 'onDownload' | 'downloading' | 'onRetry'> {
  const t = o.totals;
  const total = o.readiness.green + o.readiness.amber + o.readiness.red;
  const share = (n: number) => (total ? n / total : 0);
  return {
    period: platformPeriod(o.period.from, o.period.to, now.toISOString().slice(0, 10)),
    generatedAt: displayInstant(o.generatedAt, PLATFORM_TIME_ZONE, now).absolute,
    kpis: [
      { id: 'pilots', label: 'Pilots', value: count(t.pilots), hint: `${plural(t.organizations, 'organization')}`, level: null, href: '/platform/pilots' },
      { id: 'active', label: 'Flew in the last 30 days', value: count(t.activePilots30d), hint: t.pilots ? `${Math.round((t.activePilots30d / t.pilots) * 100)}% of pilots` : null, level: null, href: '/platform/pilots' },
      { id: 'help', label: 'Need a hand', value: count(o.pilotsNeedingHelp), hint: 'Pilots with something to fix', level: o.pilotsNeedingHelp ? 'amber' : 'green', href: '/platform/pilots?view=help' },
      { id: 'due', label: 'Due within 30 days', value: count(o.dueIn30Days), hint: 'Certificates, registrations, insurance, waivers', level: o.dueIn30Days ? 'amber' : 'green', href: '/platform/compliance' },
      { id: 'hours', label: 'Hours logged, all time', value: hoursText(t.flightSeconds), hint: plural(t.flights, 'flight'), level: null, href: null },
      { id: 'aircraft', label: 'Aircraft in service', value: count(t.aircraft), hint: null, level: null, href: null },
      { id: 'linked', label: 'Arkhon accounts linked', value: count(t.arkhonLinked), hint: `${count(t.discordLinked)} on Discord`, level: null, href: null },
      { id: 'never', label: 'Invited, never signed in', value: count(t.neverSignedIn), hint: null, level: t.neverSignedIn ? 'amber' : null, href: '/platform/pilots?flag=never_signed_in' },
    ],
    periodStats: [
      { id: 'p-hours', label: 'Flight hours', value: hoursText(o.period.flightSeconds), hint: null, level: null, href: null },
      { id: 'p-flights', label: 'Flights', value: count(o.period.flights), hint: o.period.argusFlights ? `${count(o.period.argusFlights)} from Argus` : null, level: null, href: null },
      { id: 'p-pilots', label: 'Pilots flown', value: count(o.period.pilotsFlown), hint: null, level: null, href: null },
      { id: 'p-new', label: 'New pilots', value: count(o.period.newPilots), hint: null, level: null, href: null },
    ],
    readiness: (['green', 'amber', 'red'] as const).map((level) => ({ level, label: LEVEL_TEXT[level], count: o.readiness[level], share: share(o.readiness[level]) })),
    months: platformMonths(o.monthly, o.period),
    topPilots: o.topPilots.map((p) => ({ key: `${p.orgId}:${p.pilotId}`, name: p.name, initials: initials(p.name), orgName: p.orgName, hours: hoursText(p.flightSeconds), flights: plural(p.flights, 'flight'), href: `/platform/pilots/${p.orgId}/${p.pilotId}` })),
    organizations: o.organizations.map((g) => ({ id: g.orgId, name: g.name, pilots: g.pilots, aircraft: g.aircraft, flights: count(g.flights), hours: hoursText(g.flightSeconds), readiness: g.readiness })),
  };
}

// ---------------------------------------------------------------- pilot directory

export interface PlatformPilotRowVM {
  key: string;
  orgId: string;
  pilotId: string;
  name: string;
  initials: string;
  email: string | null;
  orgName: string;
  roleLabel: string | null;
  status: StatusBadge;
  reason: string | null;
  recurrent: { text: string; level: ReadinessLevel | null; sort: string };
  hours: string;
  hoursSort: number;
  flights: number;
  lastFlight: { text: string; sort: string };
  account: { label: string; level: ReadinessLevel | null };
  arkhonLinked: boolean;
  discordLinked: boolean;
  helpFlags: HelpFlagVM[];
  helpSort: number;
  href: string;
  searchText: string;
}

export interface PlatformPilotsFilter {
  query: string;
  orgId: string;
  flag: PilotHelpFlag | 'any' | 'all';
  level: ReadinessLevel | 'all';
}

export interface PlatformPilotsScreenProps {
  state: LoadState;
  error: string | null;
  rows: PlatformPilotRowVM[];
  totalCount: number;
  filter: PlatformPilotsFilter;
  orgOptions: { id: string; name: string }[];
  flagOptions: { id: PilotHelpFlag; label: string; count: number; level: ReadinessLevel }[];
  needHelpCount: number;
  notice: { tone: 'info' | 'error'; text: string } | null;
  busy: boolean;
  onFilter: (f: PlatformPilotsFilter) => void;
  onOpen: (row: PlatformPilotRowVM) => void;
  /** Email each selected pilot what needs attention. Keys are `${orgId}:${pilotId}`. */
  onRemind: (keys: string[]) => void;
  onDownload: () => void;
  onDismissNotice: () => void;
  onRetry: () => void;
}

const ACCOUNT: Record<PlatformPilotRow['account'], { label: string; level: ReadinessLevel | null }> = {
  active: { label: 'Signed in', level: null },
  invited: { label: 'Invited', level: 'amber' },
  no_account: { label: 'No account', level: null },
};

export function platformPilotRowVM(r: PlatformPilotRow, now: Date): PlatformPilotRowVM {
  const today = now.toISOString().slice(0, 10);
  const due = r.recurrentDueOn ? displayDate(r.recurrentDueOn, today) : null;
  const dueLevel: ReadinessLevel | null = !due ? null : due.daysFromToday < 0 ? 'red' : due.daysFromToday <= 60 ? 'amber' : 'green';
  const last = r.lastFlightAt ? displayInstant(r.lastFlightAt, PLATFORM_TIME_ZONE, now) : null;
  const flags = r.helpFlags.map(flagVM);
  return {
    key: `${r.orgId}:${r.pilotId}`,
    orgId: r.orgId,
    pilotId: r.pilotId,
    name: r.name,
    initials: initials(r.name),
    email: r.email,
    orgName: r.orgName,
    roleLabel: r.role ? ROLE_LABELS[r.role] : null,
    status: { level: r.level, label: r.active ? LEVEL_TEXT[r.level] : 'Inactive' },
    reason: r.reason,
    recurrent: due ? { text: due.daysFromToday < 0 ? `Overdue · ${due.absolute}` : due.absolute, level: dueLevel, sort: due.iso } : { text: 'Not on file', level: r.active ? 'amber' : null, sort: '0000' },
    hours: hoursText(r.flightSeconds),
    hoursSort: r.flightSeconds,
    flights: r.flights,
    lastFlight: last ? { text: last.relative, sort: last.iso } : { text: 'Never', sort: '' },
    account: ACCOUNT[r.account],
    arkhonLinked: r.arkhonLinked,
    discordLinked: r.discordLinked,
    helpFlags: flags,
    helpSort: flags.length ? HELP_FLAG_ORDER.indexOf(flags[0]!.id) : HELP_FLAG_ORDER.length,
    href: `/platform/pilots/${r.orgId}/${r.pilotId}`,
    searchText: `${r.name} ${r.email ?? ''} ${r.orgName}`.toLowerCase(),
  };
}

export function filterPlatformPilots(rows: PlatformPilotRowVM[], f: PlatformPilotsFilter): PlatformPilotRowVM[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || r.searchText.includes(q)) &&
      (!f.orgId || r.orgId === f.orgId) &&
      (f.level === 'all' || r.status.level === f.level) &&
      (f.flag === 'all' || (f.flag === 'any' ? r.helpFlags.length > 0 : r.helpFlags.some((x) => x.id === f.flag))),
  );
}

export function platformFlagOptions(rows: PlatformPilotRowVM[]) {
  return HELP_FLAG_ORDER.map((id) => ({ id, label: HELP_FLAG_LABEL[id], level: HELP_FLAG_LEVEL[id], count: rows.filter((r) => r.helpFlags.some((x) => x.id === id)).length })).filter((o) => o.count > 0);
}

// ---------------------------------------------------------------- pilot detail

export interface PlatformPilotDetailScreenProps {
  state: LoadState;
  error: string | null;
  pilot: PlatformPilotRowVM | null;
  lastSignIn: string | null;
  stats: { label: string; value: string; hint: string | null }[];
  items: { key: string; label: string; due: string | null; level: ReadinessLevel; reason: string }[];
  months: PlatformChartMonthVM[];
  recentFlights: { key: string; when: string; duration: string; aircraft: string; location: string; source: 'Certa' | 'Argus' }[];
  otherOrganizations: { id: string; name: string; roleLabel: string }[];
  history: { key: string; when: string; text: string }[];
  tools: {
    canInvite: boolean;
    inviteHint: string;
    arkhonAdminUrl: string | null;
    openInOrgHref: string | null;
  };
  busy: 'remind' | 'invite' | 'logbook' | null;
  notice: { tone: 'info' | 'error'; text: string } | null;
  onRemind: (note: string) => void;
  onInvite: () => void;
  onDownloadLogbook: () => void;
  onOpenInOrg: () => void;
  onBack: () => void;
  onDismissNotice: () => void;
  onRetry: () => void;
}

const ACTION_TEXT: Record<string, string> = {
  'pilot.remind': 'Reminder emailed',
  'pilot.invite': 'Sign-in instructions re-sent',
  export: 'Logbook downloaded',
};

export function buildPlatformPilotDetail(d: PlatformPilotDetail, now: Date): Omit<PlatformPilotDetailScreenProps, 'state' | 'error' | 'busy' | 'notice' | 'onRemind' | 'onInvite' | 'onDownloadLogbook' | 'onOpenInOrg' | 'onBack' | 'onDismissNotice' | 'onRetry'> {
  const today = now.toISOString().slice(0, 10);
  const p = d.pilot;
  const row = platformPilotRowVM(p, now);
  const inviteHint =
    p.account === 'active' ? 'They’ve already signed in.' : p.account === 'no_account' ? 'This pilot record has no account. Add them under Members in their organization first.' : !p.email ? 'No email address on file.' : `Emails ${p.email} how to sign in with their Arkhon account.`;
  return {
    pilot: row,
    lastSignIn: p.lastSignInAt ? displayInstant(p.lastSignInAt, PLATFORM_TIME_ZONE, now).display : null,
    stats: [
      { label: 'Hours', value: hoursText(p.flightSeconds), hint: plural(p.flights, 'flight') },
      { label: 'Last 90 days', value: plural(p.last90DaysFlights, 'flight'), hint: null },
      { label: 'Last flight', value: row.lastFlight.text, hint: null },
      { label: 'Recurrent due', value: row.recurrent.text, hint: null },
    ],
    items: d.items.map((i, n) => ({ key: `${i.kind}:${n}`, label: i.label, due: i.dueOn ? displayDate(i.dueOn, today).display : null, level: i.level, reason: i.reason })),
    months: platformMonths(d.monthly),
    recentFlights: d.recentFlights.map((f) => ({
      key: f.id,
      when: displayInstant(f.takeoffAt, PLATFORM_TIME_ZONE, now).absolute,
      duration: `${Math.round(f.durationSeconds / 60)} min`,
      aircraft: f.aircraft ?? (f.source === 'argus' ? 'Not picked yet' : '—'),
      location: f.locationName ?? '—',
      source: f.source === 'argus' ? 'Argus' : 'Certa',
    })),
    otherOrganizations: d.otherOrganizations.map((o) => ({ id: o.orgId, name: o.name, roleLabel: ROLE_LABELS[o.role as Role] })),
    history: d.history.map((h, n) => ({
      key: `${h.at}:${n}`,
      when: displayInstant(h.at, PLATFORM_TIME_ZONE, now).display,
      text: `${ACTION_TEXT[h.action] ?? h.action}${h.actor ? ` by ${h.actor}` : ''}${h.detail && h.action === 'pilot.remind' ? ` · ${h.detail}` : ''}`,
    })),
    tools: { canInvite: p.account === 'invited' && !!p.email, inviteHint, arkhonAdminUrl: p.arkhonAdminUrl, openInOrgHref: d.viewerIsMember ? `/pilots/${p.pilotId}` : null },
  };
}

// ---------------------------------------------------------------- compliance

export interface PlatformComplianceRowVM {
  key: string;
  orgName: string;
  subject: string;
  subjectType: string;
  label: string;
  due: string;
  level: ReadinessLevel;
  reason: string;
  /** `${orgId}:${pilotId}` when there's a pilot to remind. */
  pilotKey: string | null;
  href: string | null;
}

export interface PlatformComplianceScreenProps {
  state: LoadState;
  error: string | null;
  windowDays: number;
  windowOptions: { value: number; label: string }[];
  groups: { id: string; label: string; level: ReadinessLevel; rows: PlatformComplianceRowVM[] }[];
  counts: { total: number; overdue: number; pilots: number };
  notice: { tone: 'info' | 'error'; text: string } | null;
  busy: boolean;
  onWindow: (days: number) => void;
  onRemind: (pilotKeys: string[]) => void;
  onOpen: (href: string) => void;
  onDownload: () => void;
  onDismissNotice: () => void;
  onRetry: () => void;
}

const SUBJECT_TYPE = { pilot: 'Pilot', aircraft: 'Aircraft', organization: 'Organization' } as const;

export function buildPlatformCompliance(items: PlatformComplianceItem[], now: Date): Pick<PlatformComplianceScreenProps, 'groups' | 'counts'> {
  const today = now.toISOString().slice(0, 10);
  const rows = items.map((i, n): PlatformComplianceRowVM & { days: number | null } => ({
    key: `${i.orgId}:${i.subjectId}:${i.kind}:${n}`,
    orgName: i.orgName,
    subject: i.subject,
    subjectType: SUBJECT_TYPE[i.subjectType],
    label: i.label,
    due: i.dueOn ? displayDate(i.dueOn, today).display : i.level === 'red' ? 'Now' : '—',
    level: i.level,
    reason: i.reason,
    pilotKey: i.pilotId ? `${i.orgId}:${i.pilotId}` : null,
    href: i.pilotId ? `/platform/pilots/${i.orgId}/${i.pilotId}` : null,
    days: i.daysRemaining,
  }));
  const bucket = (r: (typeof rows)[number]) => (r.days == null ? (r.level === 'red' ? 'now' : 'later') : r.days < 0 ? 'now' : r.days <= 7 ? 'week' : r.days <= 30 ? 'month' : 'later');
  const groups = [
    { id: 'now', label: 'Overdue or blocking', level: 'red' as const },
    { id: 'week', label: 'Due within 7 days', level: 'amber' as const },
    { id: 'month', label: 'Due within 30 days', level: 'amber' as const },
    { id: 'later', label: 'Coming up', level: 'green' as const },
  ]
    .map((g) => ({ ...g, rows: rows.filter((r) => bucket(r) === g.id).map(({ days: _d, ...r }) => r) }))
    .filter((g) => g.rows.length);
  return {
    groups,
    counts: { total: rows.length, overdue: rows.filter((r) => bucket(r) === 'now').length, pilots: new Set(rows.map((r) => r.pilotKey).filter(Boolean)).size },
  };
}

// ---------------------------------------------------------------- reports

export interface PlatformReportsScreenProps {
  period: PlatformPeriodVM;
  presets: typeof PLATFORM_PERIOD_PRESETS;
  datasets: { id: string; title: string; description: string; usesPeriod: boolean }[];
  downloading: string | null;
  error: string | null;
  onPreset: (preset: PlatformPeriodPreset) => void;
  onCustom: (from: string, to: string) => void;
  onDownload: (dataset: string) => void;
  onDismissError: () => void;
}

export const platformDatasets = () => Object.entries(PLATFORM_EXPORT_INFO).map(([id, d]) => ({ id, ...d }));

// ---------------------------------------------------------------- announcements

export interface AnnouncementVM {
  id: string;
  title: string;
  body: string;
  audience: string;
  important: boolean;
  live: boolean;
  posted: string;
  ends: string | null;
  reach: string | null;
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  audience: Announcement['audience'];
  important: boolean;
  /** YYYY-MM-DD, last day shown; empty = until ended. */
  endsOn: string;
  email: boolean;
  push: boolean;
}

export interface PlatformAnnouncementsScreenProps {
  state: LoadState;
  error: string | null;
  announcements: AnnouncementVM[];
  audienceOptions: { value: Announcement['audience']; label: string; description: string }[];
  pushAvailable: boolean;
  posting: boolean;
  postError: string | null;
  /** Bumped after a successful post so the form resets. */
  formKey: number;
  onPost: (draft: AnnouncementDraft) => void;
  onEnd: (id: string) => void;
  onRetry: () => void;
}

export const ANNOUNCEMENT_AUDIENCES: PlatformAnnouncementsScreenProps['audienceOptions'] = [
  { value: 'everyone', label: 'Everyone', description: 'Every Certa member' },
  { value: 'pilots', label: 'Pilots', description: 'Members with a pilot logbook' },
  { value: 'managers', label: 'Managers', description: 'Owners, admins and chief pilots' },
];

export function announcementVM(a: Announcement, now: Date): AnnouncementVM {
  const live = Date.parse(a.startsAt) <= now.getTime() && (!a.endsAt || Date.parse(a.endsAt) > now.getTime());
  const reach = [a.emailed ? `${plural(a.emailed, 'email')} sent` : null, a.pushed ? `${plural(a.pushed, 'push notification')}` : null].filter(Boolean).join(' · ');
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    audience: ANNOUNCEMENT_AUDIENCES.find((o) => o.value === a.audience)?.label ?? a.audience,
    important: a.level === 'important',
    live,
    posted: `${displayInstant(a.createdAt, PLATFORM_TIME_ZONE, now).absolute}${a.createdBy ? ` by ${a.createdBy}` : ''}`,
    ends: a.endsAt ? `${live ? 'Ends' : 'Ended'} ${displayInstant(a.endsAt, PLATFORM_TIME_ZONE, now).absolute}` : null,
    reach: reach || null,
  };
}

/** Last day shown (inclusive, in Arkhon's time zone) → the instant it stops showing. */
export function announcementEndsAt(endsOn: string): string | null {
  if (!endsOn) return null;
  // End of that day in Denver: 07:00 UTC next day is close enough and DST-safe within an hour.
  return `${addDays(endsOn, 1)}T07:00:00.000Z`;
}

// ---------------------------------------------------------------- activity

export interface PlatformActivityScreenProps {
  state: LoadState;
  error: string | null;
  events: { key: string; when: string; actor: string; action: string; subject: string | null; orgName: string | null; detail: string | null; icon: 'remind' | 'invite' | 'export' | 'announce' }[];
  onRetry: () => void;
}

const ACTIVITY: Record<string, { label: string; icon: PlatformActivityScreenProps['events'][number]['icon'] }> = {
  'pilot.remind': { label: 'Emailed a reminder', icon: 'remind' },
  'pilot.invite': { label: 'Re-sent sign-in instructions', icon: 'invite' },
  export: { label: 'Downloaded an export', icon: 'export' },
  'announcement.post': { label: 'Posted an announcement', icon: 'announce' },
  'announcement.end': { label: 'Ended an announcement', icon: 'announce' },
};

export function buildPlatformActivity(r: PlatformActivityResponse, now: Date): PlatformActivityScreenProps['events'] {
  return r.events.map((e) => ({
    key: e.id,
    when: displayInstant(e.at, PLATFORM_TIME_ZONE, now).display,
    actor: e.actor ?? 'Former admin',
    action: ACTIVITY[e.action]?.label ?? e.action,
    // Exports name their dataset by id; show its title.
    subject: e.action === 'export' && e.target && PLATFORM_EXPORT_INFO[e.target] ? PLATFORM_EXPORT_INFO[e.target]!.title : e.target,
    orgName: e.orgName,
    detail: e.detail,
    icon: ACTIVITY[e.action]?.icon ?? 'export',
  }));
}
