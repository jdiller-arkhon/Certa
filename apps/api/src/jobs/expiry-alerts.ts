/**
 * Daily expiry alerts: emails managers (and each pilot, for their own credentials) when a
 * tracked item crosses an alert threshold — 90 / 30 / 7 days before it's due by default, and
 * again once it's overdue. One digest email per recipient per org per run.
 *
 * Deduplicated through alert_deliveries: a recipient hears about an item once per threshold
 * (and per due date, so renewing a credential re-arms its alerts). If several thresholds were
 * crossed since the last run, only the tightest one is sent.
 */
import { AUTHORIZATION_KIND_LABEL, dateInZone, DEFAULT_READINESS_POLICY, evaluateItem, fleetReadiness, newId, type EvaluatedItem, type ReadinessPolicy } from '@certa/core';
import { alertDeliveries, and, authorizations, authUsers, eq, inArray, isNull, memberships, pushSubscriptions, sql, withTenant, type Db } from '@certa/db';
import type pg from 'pg';
import { loadFleet, orgMapContext } from '../lib/fleet.js';
import type { Mailer } from '../lib/mailer.js';
import type { Pusher } from '../lib/push.js';


/** Overdue items use threshold 0; usage-based items (no due date) use this due-date key. */
const OVERDUE = 0;
const USAGE_DUE = 'usage';

const MANAGER_ROLES = ['owner', 'admin', 'chief_pilot'] as const;

export interface AlertItem {
  itemKey: string;
  dueOn: string;
  threshold: number;
  subject: string;
  label: string;
  when: string;
  href: string;
  /** Pilot the item belongs to (their own credential), if any. */
  pilotId: string | null;
  aircraft: boolean;
}

/** Which threshold, if any, an evaluated item has crossed today. */
export function crossedThreshold(item: EvaluatedItem, thresholds: number[]): number | null {
  if (item.dueOn && item.daysRemaining != null) {
    if (item.daysRemaining < 0) return OVERDUE;
    const crossed = thresholds.filter((t) => item.daysRemaining! <= t);
    return crossed.length ? Math.min(...crossed) : null;
  }
  // Usage-based (flight hours / cycles): alert when overdue.
  if (item.usageFraction != null && item.usageFraction >= 1) return OVERDUE;
  return null;
}

export function alertItems(items: { item: EvaluatedItem; subject: string; href: string; pilotId: string | null; aircraft: boolean }[], thresholds: number[]): AlertItem[] {
  const out: AlertItem[] = [];
  for (const { item, subject, href, pilotId, aircraft } of items) {
    const threshold = crossedThreshold(item, thresholds);
    if (threshold == null) continue;
    const when =
      item.dueOn == null
        ? 'overdue by usage'
        : item.daysRemaining! < 0
          ? `expired ${-item.daysRemaining!} day${item.daysRemaining === -1 ? '' : 's'} ago (${item.dueOn})`
          : item.daysRemaining === 0
            ? `due today (${item.dueOn})`
            : `due in ${item.daysRemaining} day${item.daysRemaining === 1 ? '' : 's'} (${item.dueOn})`;
    out.push({ itemKey: item.key, dueOn: item.dueOn ?? USAGE_DUE, threshold, subject, label: item.label, when, href, pilotId, aircraft });
  }
  return out;
}

export interface ExpiryAlertDeps {
  pool: pg.Pool;
  mailer: Mailer;
  /** Also notify each recipient's subscribed browsers (optional). */
  pusher?: Pusher | null;
  /** e.g. https://arkhonindustries.com/certa */
  publicUrl: string;
  now?: Date;
  log?: { info: (o: object, msg: string) => void; error: (o: object, msg: string) => void };
}

interface Recipient {
  email: string;
  name: string;
  /** Accounts behind this address, for push. */
  userIds: Set<string>;
  /** Items this person should hear about. */
  items: AlertItem[];
}

async function orgIds(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ id: string }>('SELECT certa.alert_org_ids() AS id');
  return res.rows.map((r) => r.id);
}

/**
 * Waivers, airspace authorizations, COAs and LAANC approvals with an end date: last valid day is
 * the end date in the org's time zone. Managers hear about all of them; a pilot about their own.
 */
export async function authorizationItems(db: Db, timeZone: string, today: string, policy: ReadinessPolicy) {
  const rows = await db
    .select({ id: authorizations.id, kind: authorizations.kind, reference: authorizations.reference, title: authorizations.title, validTo: authorizations.validTo, pilotId: authorizations.pilotId })
    .from(authorizations)
    .where(and(isNull(authorizations.deletedAt), sql`${authorizations.validTo} is not null`));
  return rows.map((a) => ({
    pilotId: a.pilotId,
    item: evaluateItem(
      {
        kind: 'authorization',
        subjectType: a.pilotId ? 'pilot' : 'organization',
        subjectId: a.pilotId ?? a.id,
        key: `authorization:${a.id}`,
        label: `${AUTHORIZATION_KIND_LABEL[a.kind]} ${a.reference}${a.title ? ` (${a.title})` : ''}`,
        dueOn: dateInZone(a.validTo!, timeZone),
        usageFraction: null,
        blocking: false,
        ruleId: null,
      },
      today,
      policy,
    ),
  }));
}

async function planOrg(db: Db, orgId: string, now: Date) {
  const ctx = await orgMapContext(db, orgId, now);
  const policy: ReadinessPolicy = (ctx.org.alertPolicy as ReadinessPolicy | null) ?? DEFAULT_READINESS_POLICY;
  const snapshot = await loadFleet(db, orgId, now);
  const r = fleetReadiness(snapshot, { ...ctx, policy });
  const pilotName = new Map(snapshot.pilots.map((p) => [p.id, p.displayName]));
  const acName = new Map(snapshot.aircraft.map((a) => [a.id, a.nickname ?? `${a.make} ${a.model}`]));
  const evaluated = [
    ...[...r.pilots].flatMap(([id, sum]) => sum.items.map((item) => ({ item, subject: pilotName.get(id) ?? 'Pilot', href: `/pilots/${id}`, pilotId: id, aircraft: false }))),
    ...[...r.aircraft].flatMap(([id, sum]) => sum.items.map((item) => ({ item, subject: acName.get(id) ?? 'Aircraft', href: `/aircraft/${id}`, pilotId: null, aircraft: true }))),
    ...(await authorizationItems(db, ctx.org.timezone, ctx.today, policy)).map(({ item, pilotId }) => ({ item, subject: pilotId ? (pilotName.get(pilotId) ?? 'Pilot') : ctx.org.name, href: '/authorizations', pilotId, aircraft: false })),
  ];
  const items = alertItems(evaluated, policy.alertThresholdsDays);
  if (!items.length) return { org: ctx.org, recipients: [] as Recipient[] };

  const people = await db
    .select({ membershipId: memberships.id, userId: memberships.userId, role: memberships.role, expiresAt: memberships.expiresAt, email: authUsers.email, name: authUsers.name })
    .from(memberships)
    .innerJoin(authUsers, eq(authUsers.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), isNull(memberships.deletedAt)));
  const active = people.filter((p) => !p.expiresAt || new Date(p.expiresAt) > now);

  const byEmail = new Map<string, Recipient>();
  const add = (email: string | null | undefined, name: string, item: AlertItem, userId?: string) => {
    if (!email) return;
    const key = email.toLowerCase();
    const rec = byEmail.get(key) ?? { email: key, name, items: [], userIds: new Set<string>() };
    if (userId) rec.userIds.add(userId);
    if (!rec.items.some((i) => i.itemKey === item.itemKey)) rec.items.push(item);
    byEmail.set(key, rec);
  };
  for (const item of items) {
    for (const m of active) {
      if ((MANAGER_ROLES as readonly string[]).includes(m.role) || (item.aircraft && m.role === 'maintenance_tech')) add(m.email, m.name, item, m.userId);
    }
    if (item.pilotId) {
      // The pilot hears about their own credentials, via their account or the email on file.
      const pilot = snapshot.pilots.find((p) => p.id === item.pilotId);
      const member = pilot?.membershipId ? active.find((m) => m.membershipId === pilot.membershipId) : undefined;
      add(member?.email ?? pilot?.email, pilot?.displayName ?? 'Pilot', item, member?.userId);
    }
  }

  // Drop items each recipient already heard about at this (or a tighter) threshold.
  const recipients = [...byEmail.values()];
  const sent = await db
    .select({ itemKey: alertDeliveries.itemKey, dueOn: alertDeliveries.dueOn, thresholdDays: alertDeliveries.thresholdDays, recipient: alertDeliveries.recipient })
    .from(alertDeliveries)
    .where(and(eq(alertDeliveries.channel, 'email'), inArray(alertDeliveries.recipient, recipients.map((x) => x.email))));
  for (const rec of recipients) {
    rec.items = rec.items.filter((i) => !sent.some((d) => d.recipient === rec.email && d.itemKey === i.itemKey && d.dueOn === i.dueOn && d.thresholdDays <= i.threshold));
  }
  return { org: ctx.org, recipients: recipients.filter((x) => x.items.length) };
}

export function digestEmail(orgName: string, rec: Recipient, publicUrl: string) {
  const overdue = rec.items.filter((i) => i.threshold === OVERDUE);
  const soon = rec.items.filter((i) => i.threshold !== OVERDUE);
  const line = (i: AlertItem) => `  • ${i.subject} — ${i.label}: ${i.when}\n    ${publicUrl}${i.href}`;
  const parts = [`Hi ${rec.name.split(' ')[0] || 'there'},`, ''];
  if (overdue.length) parts.push('Overdue or expired:', ...overdue.map(line), '');
  if (soon.length) parts.push('Coming due:', ...soon.map(line), '');
  parts.push(
    `Open Certa to renew or update these records: ${publicUrl}/`,
    '',
    'Certa is a record-keeping tool. Operators remain responsible for compliance with all applicable regulations.',
  );
  const n = rec.items.length;
  const subject = overdue.length
    ? `${orgName}: ${overdue.length} item${overdue.length === 1 ? '' : 's'} overdue${soon.length ? `, ${soon.length} coming due` : ''}`
    : `${orgName}: ${n} item${n === 1 ? '' : 's'} coming due`;
  return { to: rec.email, subject, text: parts.join('\n') };
}

async function pushDigest(deps: ExpiryAlertDeps, orgId: string, orgName: string, rec: Recipient): Promise<number> {
  const pusher = deps.pusher!;
  const subs = await withTenant(deps.pool, { orgId, userId: null }, (db) =>
    db.select().from(pushSubscriptions).where(and(inArray(pushSubscriptions.userId, [...rec.userIds]), isNull(pushSubscriptions.deletedAt))),
  );
  const overdue = rec.items.filter((i) => i.threshold === OVERDUE).length;
  const first = rec.items[0]!;
  const message = {
    title: overdue ? `${orgName}: ${overdue} overdue` : `${orgName}: ${rec.items.length} coming due`,
    body: `${first.subject} — ${first.label}: ${first.when}${rec.items.length > 1 ? ` (+${rec.items.length - 1} more)` : ''}`,
    url: rec.items.length === 1 ? first.href : '/',
    tag: `certa-alerts-${orgId}`,
  };
  let sent = 0;
  for (const s of subs) {
    const r = await pusher.send(s, message);
    if (r === 'sent') sent += 1;
    if (r === 'gone') await withTenant(deps.pool, { orgId, userId: null }, (db) => db.update(pushSubscriptions).set({ deletedAt: sql`now()` }).where(eq(pushSubscriptions.id, s.id)));
  }
  return sent;
}

export async function runExpiryAlerts(deps: ExpiryAlertDeps) {
  const now = deps.now ?? new Date();
  const summary = { orgs: 0, emails: 0, items: 0, pushes: 0, failures: 0 };
  for (const orgId of await orgIds(deps.pool)) {
    summary.orgs += 1;
    try {
      const plan = await withTenant(deps.pool, { orgId, userId: null }, (db) => planOrg(db, orgId, now));
      for (const rec of plan.recipients) {
        try {
          await deps.mailer.send(digestEmail(plan.org.name, rec, deps.publicUrl));
        } catch (err) {
          summary.failures += 1;
          deps.log?.error({ err, orgId }, 'expiry alert email failed');
          continue;
        }
        // Record only after a successful send, so a mail outage retries tomorrow.
        await withTenant(deps.pool, { orgId, userId: null }, (db) =>
          db
            .insert(alertDeliveries)
            .values(rec.items.map((i) => ({ id: newId(), itemKey: i.itemKey, dueOn: i.dueOn, thresholdDays: i.threshold, channel: 'email', recipient: rec.email })))
            .onConflictDoNothing(),
        );
        summary.emails += 1;
        summary.items += rec.items.length;
        if (deps.pusher && rec.userIds.size) summary.pushes += await pushDigest(deps, orgId, plan.org.name, rec);
      }
    } catch (err) {
      summary.failures += 1;
      deps.log?.error({ err, orgId }, 'expiry alerts failed for org');
    }
  }
  deps.log?.info(summary, 'expiry alerts done');
  return summary;
}
