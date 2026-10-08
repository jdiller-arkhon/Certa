import type { Role } from './enums.js';

/**
 * Single permission matrix shared by the API (enforcement) and the UIs (hiding actions).
 * Resource-ownership rules ("pilots log their *own* flights") are expressed via the `own`
 * scope and checked against context by `can()`.
 */
export const ACTIONS = [
  'org.read',
  'org.update',
  'org.billing',
  'members.read',
  'members.manage',
  'rules.read',
  'rules.override',
  'audit.read',
  'pilots.read',
  'pilots.manage',
  'credentials.read',
  'credentials.manage',
  'aircraft.read',
  'aircraft.manage',
  'aircraft.ground',
  'aircraft.override_grounding',
  'batteries.read',
  'batteries.manage',
  'components.manage',
  'maintenance.read',
  'maintenance.manage',
  'flights.read',
  'flights.log',
  'flights.edit',
  'missions.read',
  'missions.manage',
  'checklists.read',
  'checklists.manage_templates',
  'checklists.run',
  'incidents.read',
  'incidents.report',
  'incidents.manage',
  'exports.create',
  'integrity.verify',
  'integrations.manage',
] as const;
export type Action = (typeof ACTIONS)[number];

type Grant = 'all' | 'own';

const READ_ALL: Partial<Record<Action, Grant>> = {
  'org.read': 'all',
  'members.read': 'all',
  'rules.read': 'all',
  'pilots.read': 'all',
  'credentials.read': 'all',
  'aircraft.read': 'all',
  'batteries.read': 'all',
  'maintenance.read': 'all',
  'flights.read': 'all',
  'missions.read': 'all',
  'checklists.read': 'all',
  'incidents.read': 'all',
};

const everything = Object.fromEntries(ACTIONS.map((a) => [a, 'all'])) as Record<Action, Grant>;

export const PERMISSIONS: Record<Role, Partial<Record<Action, Grant>>> = {
  owner: everything,
  admin: Object.fromEntries(ACTIONS.filter((a) => a !== 'org.billing').map((a) => [a, 'all'])),
  chief_pilot: {
    ...READ_ALL,
    'audit.read': 'all',
    'pilots.manage': 'all',
    'credentials.manage': 'all',
    'aircraft.manage': 'all',
    'aircraft.ground': 'all',
    'batteries.manage': 'all',
    'flights.log': 'all',
    'flights.edit': 'all',
    'missions.manage': 'all',
    'checklists.manage_templates': 'all',
    'checklists.run': 'all',
    'incidents.report': 'all',
    'incidents.manage': 'all',
    'exports.create': 'all',
    'integrity.verify': 'all',
  },
  pilot: {
    ...READ_ALL,
    'credentials.manage': 'own',
    'flights.log': 'own',
    'flights.edit': 'own',
    'checklists.run': 'all',
    'incidents.report': 'all',
    'exports.create': 'own',
  },
  maintenance_tech: {
    ...READ_ALL,
    'aircraft.ground': 'all',
    'batteries.manage': 'all',
    'components.manage': 'all',
    'maintenance.manage': 'all',
    'checklists.run': 'all',
    'incidents.report': 'all',
  },
  viewer: { ...READ_ALL },
  auditor: {
    ...READ_ALL,
    'audit.read': 'all',
    'integrity.verify': 'all',
    'exports.create': 'all',
  },
};

export interface PermissionContext {
  /** The pilot record linked to the acting membership, if any. */
  actorPilotId?: string | null;
  /** The pilot the target resource belongs to (e.g. PIC of a flight). */
  resourcePilotId?: string | null;
}

export function can(role: Role, action: Action, ctx: PermissionContext = {}): boolean {
  const grant = PERMISSIONS[role][action];
  if (grant === 'all') return true;
  if (grant === 'own') {
    // Without a target we only know the role *may* act on its own resources (used for UI hints).
    if (ctx.resourcePilotId === undefined) return true;
    return !!ctx.actorPilotId && ctx.actorPilotId === ctx.resourcePilotId;
  }
  return false;
}

export function grantFor(role: Role, action: Action): Grant | null {
  return PERMISSIONS[role][action] ?? null;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  chief_pilot: 'Chief Pilot',
  pilot: 'Pilot',
  maintenance_tech: 'Maintenance Tech',
  viewer: 'Viewer',
  auditor: 'Auditor',
};
