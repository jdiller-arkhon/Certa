/**
 * Domain → view-model mappers. Containers (web app, online or offline) and the contract fixture generator both
 * use these, so fixtures always match what the real app renders.
 */
import type {
  Aircraft,
  AuditEvent,
  Battery,
  Credential,
  Flight,
  Pilot,
} from '../domain/entities.js';
import type { ReadinessLevel, Role, UnitsPreference } from '../domain/enums.js';
import { ACTIONS, can, ROLE_LABELS, type Action } from '../domain/permissions.js';
import { displayDate, displayInstant } from '../format/dates.js';
import { formatDuration, formatLength, formatMass, formatSpeed } from '../format/units.js';
import type { ResolvedRule, ResolvedRulePack } from '../rules/engine.js';
import { credentialExpiry } from '../rules/evaluators.js';
import {
  DEFAULT_READINESS_POLICY,
  pilotCredentialItems,
  summarize,
  type EvaluatedItem,
  type ExpiringItem,
  type ReadinessPolicy,
  type ReadinessSummary,
} from '../readiness/readiness.js';
import type {
  AppShellViewModel,
  NavItem,
  ReadinessReason,
  StatusBadge,
  SyncStateViewModel,
  ThemeName,
  UserChip,
} from './common.js';
import { COMPLIANCE_NOTICE } from './common.js';
import type {
  AircraftRowViewModel,
  AuditEventViewModel,
  BatteryRowViewModel,
  CredentialViewModel,
  FlightRowViewModel,
  MemberRowViewModel,
  PilotRowViewModel,
  ReadinessRowViewModel,
  RuleRowViewModel,
} from './screens.js';

export interface MapContext {
  /** Today's date in the org's time zone (YYYY-MM-DD). */
  today: string;
  now: Date;
  units: UnitsPreference;
  orgTimeZone: string;
  policy?: ReadinessPolicy;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function userChip(id: string, name: string): UserChip {
  return { id, name, initials: initials(name) };
}

export const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  green: 'Current',
  amber: 'Attention',
  red: 'Not current',
};

export function badgeFromSummary(summary: ReadinessSummary, labels: Partial<Record<ReadinessLevel, string>> = {}): StatusBadge {
  const top = summary.reasons[0];
  if (summary.level === 'green') return { level: 'green', label: labels.green ?? LEVEL_LABEL.green };
  if (top?.daysRemaining != null && top.daysRemaining >= 0 && summary.level === 'amber')
    return { level: 'amber', label: top.daysRemaining === 0 ? 'Expires today' : `Expires in ${top.daysRemaining} days` };
  return { level: summary.level, label: labels[summary.level] ?? LEVEL_LABEL[summary.level] };
}

export function reasonFromItem(item: EvaluatedItem, today: string, href: string | null): ReadinessReason {
  return {
    level: item.level,
    text: item.reason,
    due: item.dueOn ? displayDate(item.dueOn, today) : null,
    href,
  };
}

// ---------------------------------------------------------------- pilots & credentials

export function pilotReadiness(
  pilot: Pick<Pilot, 'id'>,
  credentials: Credential[],
  rules: ResolvedRulePack,
  ctx: MapContext,
): ReadinessSummary {
  return summarize(
    pilotCredentialItems(pilot.id, credentials.filter((c) => !c.deletedAt), rules),
    ctx.today,
    ctx.policy ?? DEFAULT_READINESS_POLICY,
  );
}

export function toCredentialViewModel(c: Credential, rules: ResolvedRulePack, ctx: MapContext): CredentialViewModel {
  const type = rules.pack.credentialTypes.find((t) => t.id === c.credentialType);
  const exp = credentialExpiry(c, rules);
  const rule = exp.ruleId ? rules.rules.get(exp.ruleId) : undefined;
  const summary = summarize(
    [{ kind: 'credential', subjectType: 'pilot', subjectId: c.pilotId, key: c.id, label: type?.label ?? c.credentialType, dueOn: exp.expiresOn, usageFraction: null, blocking: false, ruleId: exp.ruleId }],
    ctx.today,
    ctx.policy,
  );
  const basis =
    exp.basis === 'explicit'
      ? 'Expiry date from the credential'
      : exp.basis === 'non_expiring'
        ? 'Does not expire'
        : exp.basis === 'rule'
          ? `Computed from issue date per ${rule?.source.citation ?? exp.ruleId}`
          : 'Expiry unknown — add an issue or expiry date';
  return {
    id: c.id,
    typeLabel: type?.label ?? c.credentialType,
    identifier: c.identifier,
    issued: c.issuedOn ? displayDate(c.issuedOn, ctx.today) : null,
    expires: exp.expiresOn ? displayDate(exp.expiresOn, ctx.today) : null,
    expiryBasis: basis,
    status: exp.basis === 'unknown' ? { level: 'amber', label: 'Needs dates' } : badgeFromSummary(summary, { green: exp.expiresOn ? 'Current' : 'No expiry' }),
    documentCount: c.documentIds.length,
  };
}

export function toPilotRow(
  pilot: Pilot,
  summary: ReadinessSummary,
  totals: { flightSeconds: number; lastFlightAt: string | null },
  ctx: MapContext,
): PilotRowViewModel {
  return {
    id: pilot.id,
    name: pilot.displayName,
    certificateNumber: pilot.certificateNumber,
    status: badgeFromSummary(summary),
    totalFlightTime: formatDuration(totals.flightSeconds),
    lastFlight: totals.lastFlightAt ? displayInstant(totals.lastFlightAt, ctx.orgTimeZone, ctx.now) : null,
  };
}

export function toPilotReadinessRow(pilot: Pilot, summary: ReadinessSummary, ctx: MapContext): ReadinessRowViewModel {
  const href = `/pilots/${pilot.id}`;
  return {
    id: pilot.id,
    name: pilot.displayName,
    subtitle: pilot.certificateNumber ? `Cert. ${pilot.certificateNumber}` : null,
    status: badgeFromSummary(summary),
    reasons: summary.reasons.map((r) => reasonFromItem(r, ctx.today, href)),
    href,
  };
}

// ---------------------------------------------------------------- aircraft & batteries

export function aircraftItems(a: Aircraft): ExpiringItem[] {
  const items: ExpiringItem[] = [];
  if (a.status === 'grounded')
    items.push({ kind: 'grounding', subjectType: 'aircraft', subjectId: a.id, key: `grounded:${a.id}`, label: `Grounded${a.groundedReason ? `: ${a.groundedReason}` : ''}`, dueOn: null, usageFraction: null, blocking: true, ruleId: null });
  if (a.registrationNumber || a.registrationExpiresOn)
    items.push({ kind: 'aircraft_registration', subjectType: 'aircraft', subjectId: a.id, key: `registration:${a.id}`, label: 'Registration', dueOn: a.registrationExpiresOn, usageFraction: null, blocking: false, ruleId: 'aircraft.registration.validity' });
  else
    items.push({ kind: 'aircraft_registration', subjectType: 'aircraft', subjectId: a.id, key: `registration_missing:${a.id}`, label: 'Registration not on file', dueOn: null, usageFraction: null, blocking: true, ruleId: 'aircraft.registration.required_part107' });
  return items;
}

export function aircraftName(a: Pick<Aircraft, 'nickname' | 'make' | 'model'>): string {
  return a.nickname ?? `${a.make} ${a.model}`;
}

export function aircraftReadiness(a: Aircraft, extra: ExpiringItem[], ctx: MapContext): ReadinessSummary {
  return summarize([...aircraftItems(a), ...extra], ctx.today, ctx.policy);
}

export function toAircraftRow(a: Aircraft, summary: ReadinessSummary): AircraftRowViewModel {
  return {
    id: a.id,
    name: aircraftName(a),
    makeModel: `${a.make} ${a.model}`,
    serialNumber: a.serialNumber,
    registrationNumber: a.registrationNumber,
    status: a.status === 'grounded' ? { level: 'red', label: 'Grounded' } : a.status === 'retired' ? { level: 'amber', label: 'Retired' } : badgeFromSummary(summary, { green: 'Airworthy' }),
    totalFlightTime: formatDuration(a.totalFlightSeconds),
    totalFlights: a.totalFlights,
  };
}

export function toAircraftReadinessRow(a: Aircraft, summary: ReadinessSummary, ctx: MapContext): ReadinessRowViewModel {
  const href = `/aircraft/${a.id}`;
  return {
    id: a.id,
    name: aircraftName(a),
    subtitle: a.registrationNumber ? `Reg. ${a.registrationNumber}` : `S/N ${a.serialNumber}`,
    status: toAircraftRow(a, summary).status,
    reasons: summary.reasons.map((r) => reasonFromItem(r, ctx.today, href)),
    href,
  };
}

export function batteryItems(b: Battery): ExpiringItem[] {
  if (b.status === 'retired') return [];
  return b.thresholds.maxCycles
    ? [{ kind: 'battery', subjectType: 'battery', subjectId: b.id, key: `battery_cycles:${b.id}`, label: `Battery ${b.label ?? b.serialNumber} cycles`, dueOn: null, usageFraction: b.cycleCount / b.thresholds.maxCycles, blocking: false, ruleId: null }]
    : [];
}

export function toBatteryRow(b: Battery, lastUsedAt: string | null, ctx: MapContext): BatteryRowViewModel {
  const summary = summarize(batteryItems(b), ctx.today, ctx.policy);
  return {
    id: b.id,
    label: b.label ?? b.serialNumber,
    serialNumber: b.serialNumber,
    cycleCount: b.cycleCount,
    cycleLimit: b.thresholds.maxCycles,
    status: b.status === 'retired' ? { level: 'amber', label: 'Retired' } : b.status === 'watch' ? { level: 'amber', label: 'Watch' } : badgeFromSummary(summary, { green: 'Healthy', amber: 'Nearing limit', red: 'Retire' }),
    lastUsed: lastUsedAt ? displayInstant(lastUsedAt, ctx.orgTimeZone, ctx.now) : null,
  };
}

// ---------------------------------------------------------------- flights

export function toFlightRow(
  f: Flight,
  names: { pilot: string; aircraft: string },
  ctx: MapContext,
  pendingSync = false,
): FlightRowViewModel {
  return {
    id: f.id,
    takeoff: displayInstant(f.takeoffAt, f.localTimeZone, ctx.now),
    duration: formatDuration(f.durationSeconds),
    pilotName: names.pilot,
    aircraftName: names.aircraft,
    locationName: f.locationName,
    maxAltitude: f.maxAltitudeAglM == null ? null : formatLength(f.maxAltitudeAglM, ctx.units),
    source: f.source,
    pendingSync,
  };
}

// ---------------------------------------------------------------- rules, members, audit

function describeRuleValue(r: Pick<ResolvedRule, 'kind' | 'value'> & { unit?: string }, units: UnitsPreference): string {
  switch (r.kind) {
    case 'duration': {
      const v = r.value as { amount: number; unit: string; roundTo: string };
      return `${v.amount} ${v.amount === 1 ? v.unit.replace(/s$/, '') : v.unit}${v.roundTo === 'end_of_month' ? ' (calendar)' : ''}`;
    }
    case 'length': {
      const m = r.value as number;
      return units.length === 'm' ? formatLength(m, units, 1).display : `${formatLength(m, units).display} (${formatLength(m, { ...units, length: 'm' }, 1).display})`;
    }
    case 'speed':
      return formatSpeed(r.value as number, units).display;
    case 'mass':
      return formatMass(r.value as number, units).display;
    case 'money':
      return `${((r.value as number) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${r.unit ?? ''}`.trim();
    case 'boolean':
      return r.value ? 'Yes' : 'No';
    case 'date':
      return displayDate(r.value as string, r.value as string).absolute;
    default:
      return String(r.value);
  }
}

export function toRuleRow(
  r: ResolvedRule,
  ctx: MapContext,
  opts: { canOverride: boolean; override?: { setBy: string | null; setAt: string } | null },
): RuleRowViewModel {
  const unit = 'unit' in r ? (r.unit as string) : undefined;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    appliesTo: r.appliesTo,
    valueDisplay: describeRuleValue({ kind: r.kind, value: r.value, unit }, ctx.units),
    packValueDisplay: r.override ? describeRuleValue({ kind: r.kind, value: r.packValue, unit }, ctx.units) : null,
    statedAs: r.statedAs,
    sourceCitation: r.source.citation,
    sourceTitle: r.source.title,
    sourceUrl: r.source.url,
    lastVerified: r.lastVerifiedOn ? displayDate(r.lastVerifiedOn, ctx.today) : null,
    needsVerification: r.needsVerification,
    override:
      r.override && opts.override
        ? { reason: r.override.reason, setBy: opts.override.setBy, setAt: displayInstant(opts.override.setAt, ctx.orgTimeZone, ctx.now) }
        : null,
    canOverride: opts.canOverride,
    valueKind: r.kind,
  };
}

export function toMemberRow(
  m: { membershipId: string; userId: string; name: string; email: string; role: Role; expiresAt: string | null; createdAt: string },
  currentUserId: string,
  ctx: MapContext,
): MemberRowViewModel {
  return {
    membershipId: m.membershipId,
    user: userChip(m.userId, m.name),
    email: m.email,
    role: m.role,
    roleLabel: ROLE_LABELS[m.role],
    expires: m.expiresAt ? displayInstant(m.expiresAt, ctx.orgTimeZone, ctx.now) : null,
    joined: displayInstant(m.createdAt, ctx.orgTimeZone, ctx.now),
    isSelf: m.userId === currentUserId,
  };
}

const TABLE_LABELS: Record<string, string> = {
  organizations: 'Organization',
  memberships: 'Membership',
  pilots: 'Pilot',
  credentials: 'Credential',
  aircraft: 'Aircraft',
  batteries: 'Battery',
  flights: 'Flight',
  org_rule_overrides: 'Rule override',
  maintenance_events: 'Maintenance event',
  incidents: 'Incident',
};

const HIDDEN_AUDIT_FIELDS = new Set(['updated_at', 'updated_by', 'version', 'created_at', 'created_by', 'org_id', 'id']);

function auditValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function toAuditEventViewModel(e: AuditEvent & { actorName: string | null }, ctx: MapContext): AuditEventViewModel {
  const before = e.before ?? {};
  const after = e.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN_AUDIT_FIELDS.has(k));
  const changes = keys
    .filter((k) => e.operation !== 'UPDATE' || JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, before: auditValue(before[k]), after: auditValue(after[k]) }));
  const deleted = e.operation === 'DELETE' || (e.operation === 'UPDATE' && !before.deleted_at && !!after.deleted_at);
  return {
    id: e.id,
    at: displayInstant(e.at, ctx.orgTimeZone, ctx.now),
    actor: e.actorUserId && e.actorName ? userChip(e.actorUserId, e.actorName) : null,
    actorLabel: e.actorUserId ? (e.actorName ?? 'Unknown user') : 'Direct database change',
    entityLabel: TABLE_LABELS[e.tableName] ?? e.tableName,
    operation: e.operation === 'INSERT' ? 'created' : deleted ? 'deleted' : 'updated',
    changes,
  };
}

// ---------------------------------------------------------------- shell

const NAV: { id: string; label: string; href: string; icon: NavItem['icon']; requires: Action }[] = [
  { id: 'today', label: 'Today', href: '/', icon: 'today', requires: 'org.read' },
  { id: 'flights', label: 'Flights', href: '/flights', icon: 'flights', requires: 'flights.read' },
  { id: 'pilots', label: 'Pilots', href: '/pilots', icon: 'pilots', requires: 'pilots.read' },
  { id: 'aircraft', label: 'Aircraft', href: '/aircraft', icon: 'aircraft', requires: 'aircraft.read' },
  { id: 'batteries', label: 'Batteries', href: '/batteries', icon: 'batteries', requires: 'batteries.read' },
  { id: 'rules', label: 'Rule pack', href: '/admin/rules', icon: 'admin', requires: 'rules.read' },
  { id: 'members', label: 'Members', href: '/admin/members', icon: 'admin', requires: 'members.read' },
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: 'records', requires: 'audit.read' },
  { id: 'settings', label: 'Settings', href: '/settings/organization', icon: 'settings', requires: 'org.read' },
];

export function buildNavigation(role: Role, activeHref: string, badges: Record<string, NavItem['badge']> = {}): NavItem[] {
  return NAV.filter((n) => can(role, n.requires)).map((n) => ({
    id: n.id,
    label: n.label,
    href: n.href,
    icon: n.icon,
    active: n.href === '/' ? activeHref === '/' : activeHref.startsWith(n.href),
    badge: badges[n.id] ?? null,
  }));
}

export const WEB_SYNC_STATE: SyncStateViewModel = {
  status: 'online',
  pendingChanges: 0,
  lastSynced: null,
  message: null,
  conflictCount: 0,
};

export function buildShell(input: {
  user: { id: string; name: string; email: string };
  role: Role;
  organization: { id: string; name: string };
  memberships: { orgId: string; orgName: string; role: Role }[];
  activeHref: string;
  sync?: SyncStateViewModel;
  theme?: ThemeName;
  navBadges?: Record<string, NavItem['badge']>;
  basePath?: string;
}): AppShellViewModel {
  return {
    basePath: input.basePath ?? '',
    user: { ...userChip(input.user.id, input.user.name), email: input.user.email, roleLabel: ROLE_LABELS[input.role] },
    organization: input.organization,
    orgOptions: input.memberships.map((m) => ({ orgId: m.orgId, name: m.orgName, role: m.role, current: m.orgId === input.organization.id })),
    navigation: buildNavigation(input.role, input.activeHref, input.navBadges),
    permissions: allowedActions(input.role),
    complianceNotice: COMPLIANCE_NOTICE,
    sync: input.sync ?? WEB_SYNC_STATE,
    theme: input.theme ?? 'light',
  };
}

export function allowedActions(role: Role): Action[] {
  return ACTIONS.filter((a) => can(role, a));
}

/** Maps the API's rule row (already resolved server-side) to the screen view-model. */
export function ruleRowFromApi(
  row: {
    id: string;
    title: string;
    description: string;
    kind: string;
    appliesTo: string;
    value: unknown;
    packValue: unknown;
    unit: string | null;
    statedAs: string | null;
    source: { title: string; citation: string; url: string | null };
    lastVerifiedOn: string | null;
    needsVerification: boolean;
    override: { value: unknown; reason: string; setBy: string | null; setAt: string } | null;
  },
  ctx: MapContext,
  canOverride: boolean,
): RuleRowViewModel {
  const kind = row.kind as RuleRowViewModel['valueKind'];
  const unit = row.unit ?? undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    appliesTo: row.appliesTo,
    valueDisplay: describeRuleValue({ kind, value: row.value, unit } as never, ctx.units),
    packValueDisplay: row.override ? describeRuleValue({ kind, value: row.packValue, unit } as never, ctx.units) : null,
    statedAs: row.statedAs,
    sourceCitation: row.source.citation,
    sourceTitle: row.source.title,
    sourceUrl: row.source.url,
    lastVerified: row.lastVerifiedOn ? displayDate(row.lastVerifiedOn, ctx.today) : null,
    needsVerification: row.needsVerification,
    override: row.override
      ? { reason: row.override.reason, setBy: row.override.setBy, setAt: displayInstant(row.override.setAt, ctx.orgTimeZone, ctx.now) }
      : null,
    canOverride,
    valueKind: kind,
  };
}
