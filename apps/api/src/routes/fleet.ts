import { api, goNoGo, Id, newId } from '@certa/core';
import {
  aircraft,
  and,
  batteries,
  credentials,
  eq,
  insuranceCoveredAircraft,
  insurancePolicies,
  isNull,
  maintenanceEvents,
  maintenanceSchedules,
  components,
  pilots,
  sql,
  trainingRecords,
  desc,
  type Db,
} from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg, type OrgContext } from '../lib/context.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  loadFleet,
  orgMapContext,
  toAircraft,
  toBattery,
  toCredential,
  toInsurancePolicy,
  toMaintenanceSchedule,
  toPilot,
  toTrainingRecord,
} from '../lib/fleet.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const PilotParams = OrgParams.extend({ pilotId: Id });
const CredentialParams = OrgParams.extend({ credentialId: Id });
const AircraftParams = OrgParams.extend({ aircraftId: Id });
const BatteryParams = OrgParams.extend({ batteryId: Id });
const PolicyParams = OrgParams.extend({ policyId: Id });
const ScheduleParams = OrgParams.extend({ scheduleId: Id });

/** Unique-violation → 409 with a readable message. */
async function uniquely<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') throw conflict(message);
    throw err;
  }
}

const nn = <T>(v: T | null | undefined) => (v === undefined ? undefined : v);

export const fleetRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const org = async (req: Parameters<typeof resolveOrg>[1], orgId: string) => resolveOrg(ctx.pool, req, orgId);
    const run = <T>(req: Parameters<typeof inOrg>[1], oc: OrgContext, fn: (db: Db) => Promise<T>) => inOrg(ctx.pool, req, oc, fn);

    // ---------------------------------------------------------------- snapshot
    app.get(
      '/orgs/:orgId/fleet',
      {
        schema: {
          tags: ['fleet'],
          summary: 'Everything needed to compute readiness and render the Phase 2 screens (offline-cacheable)',
          params: OrgParams,
          response: { 200: api.FleetSnapshotResponse },
        },
      },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'pilots.read');
        authorize(oc, 'aircraft.read');
        return run(req, oc, (db) => loadFleet(db, oc.orgId));
      },
    );

    // ---------------------------------------------------------------- pre-flight go / no-go
    app.post(
      '/orgs/:orgId/preflight',
      { schema: { tags: ['flights'], summary: 'Pre-flight go / no-go from records on file (advisory)', params: OrgParams, body: api.PreflightRequest, response: { 200: api.PreflightResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'flights.read');
        return run(req, oc, async (db) => {
          const snapshot = await loadFleet(db, oc.orgId);
          const mctx = await orgMapContext(db, oc.orgId);
          return goNoGo(snapshot, req.body, mctx);
        });
      },
    );

    // ---------------------------------------------------------------- pilots
    app.post(
      '/orgs/:orgId/pilots',
      { schema: { tags: ['pilots'], params: OrgParams, body: api.CreatePilotRequest, response: { 201: api.PilotResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'pilots.manage');
        const row = await run(req, oc, async (db) => {
          const [r] = await db
            .insert(pilots)
            .values({ id: newId(), displayName: req.body.displayName, email: req.body.email ?? null, phone: req.body.phone ?? null, certificateNumber: req.body.certificateNumber ?? null })
            .returning();
          return r!;
        });
        return reply.status(201).send(toPilot(row));
      },
    );

    app.patch(
      '/orgs/:orgId/pilots/:pilotId',
      { schema: { tags: ['pilots'], params: PilotParams, body: api.UpdatePilotRequest, response: { 200: api.PilotResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'pilots.manage');
        const b = req.body;
        return run(req, oc, async (db) => {
          const [r] = await db
            .update(pilots)
            .set({ displayName: b.displayName, email: nn(b.email), phone: nn(b.phone), certificateNumber: nn(b.certificateNumber), active: b.active })
            .where(and(eq(pilots.id, req.params.pilotId), isNull(pilots.deletedAt)))
            .returning();
          if (!r) throw notFound('Pilot');
          return toPilot(r);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/pilots/:pilotId',
      { schema: { tags: ['pilots'], summary: 'Archive a pilot (records and flights are kept)', params: PilotParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'pilots.manage');
        await run(req, oc, async (db) => {
          const [r] = await db.update(pilots).set({ deletedAt: sql`now()`, active: false }).where(and(eq(pilots.id, req.params.pilotId), isNull(pilots.deletedAt))).returning({ id: pilots.id });
          if (!r) throw notFound('Pilot');
        });
        return reply.status(204).send(null);
      },
    );

    // ---------------------------------------------------------------- credentials & training
    const assertPilot = async (db: Db, pilotId: string) => {
      const [p] = await db.select({ id: pilots.id }).from(pilots).where(and(eq(pilots.id, pilotId), isNull(pilots.deletedAt)));
      if (!p) throw notFound('Pilot');
    };
    const assertCredentialType = async (db: Db, oc: OrgContext, type: string) => {
      const { loadRuleInputs } = await import('../lib/rulepack.js');
      const mctx = await orgMapContext(db, oc.orgId);
      const rules = await loadRuleInputs(db, mctx.org.defaultJurisdiction);
      if (!rules?.pack.credentialTypes.some((t) => t.id === type)) throw badRequest(`Unknown credential type ${type}`);
      return mctx.org.defaultJurisdiction;
    };

    app.post(
      '/orgs/:orgId/pilots/:pilotId/credentials',
      { schema: { tags: ['pilots'], params: PilotParams, body: api.CreateCredentialRequest, response: { 201: api.CredentialResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'credentials.manage', req.params.pilotId);
        const b = req.body;
        if (b.issuedOn && b.expiresOn && b.expiresOn < b.issuedOn) throw badRequest('Expiry date is before the issue date');
        const row = await run(req, oc, async (db) => {
          await assertPilot(db, req.params.pilotId);
          const jurisdiction = b.jurisdiction ?? (await assertCredentialType(db, oc, b.credentialType));
          if (b.jurisdiction) await assertCredentialType(db, oc, b.credentialType);
          const [r] = await db
            .insert(credentials)
            .values({ id: newId(), pilotId: req.params.pilotId, credentialType: b.credentialType, jurisdiction, identifier: b.identifier ?? null, issuedOn: b.issuedOn ?? null, expiresOn: b.expiresOn ?? null, notes: b.notes ?? null })
            .returning();
          return r!;
        });
        return reply.status(201).send(toCredential(row));
      },
    );

    const credentialFor = async (db: Db, id: string) => {
      const [c] = await db.select().from(credentials).where(and(eq(credentials.id, id), isNull(credentials.deletedAt)));
      if (!c) throw notFound('Credential');
      return c;
    };

    app.patch(
      '/orgs/:orgId/credentials/:credentialId',
      { schema: { tags: ['pilots'], params: CredentialParams, body: api.UpdateCredentialRequest, response: { 200: api.CredentialResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        const b = req.body;
        return run(req, oc, async (db) => {
          const c = await credentialFor(db, req.params.credentialId);
          authorize(oc, 'credentials.manage', c.pilotId);
          if (b.credentialType) await assertCredentialType(db, oc, b.credentialType);
          const issued = b.issuedOn === undefined ? c.issuedOn : b.issuedOn;
          const expires = b.expiresOn === undefined ? c.expiresOn : b.expiresOn;
          if (issued && expires && expires < issued) throw badRequest('Expiry date is before the issue date');
          const [r] = await db
            .update(credentials)
            .set({ credentialType: b.credentialType, identifier: nn(b.identifier), issuedOn: nn(b.issuedOn), expiresOn: nn(b.expiresOn), notes: nn(b.notes) })
            .where(eq(credentials.id, c.id))
            .returning();
          return toCredential(r!);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/credentials/:credentialId',
      { schema: { tags: ['pilots'], params: CredentialParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        await run(req, oc, async (db) => {
          const c = await credentialFor(db, req.params.credentialId);
          authorize(oc, 'credentials.manage', c.pilotId);
          await db.update(credentials).set({ deletedAt: sql`now()` }).where(eq(credentials.id, c.id));
        });
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/orgs/:orgId/pilots/:pilotId/training',
      { schema: { tags: ['pilots'], params: PilotParams, response: { 200: api.TrainingRecordListResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'credentials.read');
        return run(req, oc, async (db) => ({
          records: (await db.select().from(trainingRecords).where(and(eq(trainingRecords.pilotId, req.params.pilotId), isNull(trainingRecords.deletedAt))).orderBy(desc(trainingRecords.completedOn))).map(toTrainingRecord),
        }));
      },
    );

    app.post(
      '/orgs/:orgId/pilots/:pilotId/training',
      { schema: { tags: ['pilots'], params: PilotParams, body: api.CreateTrainingRecordRequest, response: { 201: api.TrainingRecordListResponse.shape.records.element } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'credentials.manage', req.params.pilotId);
        const row = await run(req, oc, async (db) => {
          await assertPilot(db, req.params.pilotId);
          const [r] = await db.insert(trainingRecords).values({ id: newId(), pilotId: req.params.pilotId, course: req.body.course, provider: req.body.provider ?? null, completedOn: req.body.completedOn, hours: req.body.hours ?? null }).returning();
          return r!;
        });
        return reply.status(201).send(toTrainingRecord(row));
      },
    );

    // ---------------------------------------------------------------- aircraft
    const aircraftFor = async (db: Db, id: string) => {
      const [a] = await db.select().from(aircraft).where(and(eq(aircraft.id, id), isNull(aircraft.deletedAt)));
      if (!a) throw notFound('Aircraft');
      return a;
    };

    app.post(
      '/orgs/:orgId/aircraft',
      { schema: { tags: ['aircraft'], params: OrgParams, body: api.CreateAircraftRequest, response: { 201: api.AircraftResponse, 409: api.ErrorResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        const b = req.body;
        const row = await run(req, oc, (db) =>
          uniquely(async () => {
            const [r] = await db
              .insert(aircraft)
              .values({
                id: newId(),
                nickname: b.nickname ?? null,
                make: b.make,
                model: b.model,
                serialNumber: b.serialNumber,
                registrationNumber: b.registrationNumber ?? null,
                registrationExpiresOn: b.registrationExpiresOn ?? null,
                remoteIdMethod: b.remoteIdMethod,
                remoteIdSerial: b.remoteIdSerial ?? null,
                takeoffMassKg: b.takeoffMassKg ?? null,
                firmwareVersion: b.firmwareVersion ?? null,
              })
              .returning();
            return r!;
          }, 'An aircraft with that make and serial number already exists'),
        );
        return reply.status(201).send(toAircraft(row));
      },
    );

    app.patch(
      '/orgs/:orgId/aircraft/:aircraftId',
      { schema: { tags: ['aircraft'], params: AircraftParams, body: api.UpdateAircraftRequest, response: { 200: api.AircraftResponse, 409: api.ErrorResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        const b = req.body;
        return run(req, oc, async (db) => {
          const a = await aircraftFor(db, req.params.aircraftId);
          // Grounding changes go through /ground and /return-to-service so they're attributable.
          if (b.status === 'active' && a.status === 'grounded') throw badRequest('Use return-to-service to clear a grounding');
          const r = await uniquely(async () => {
            const [x] = await db
              .update(aircraft)
              .set({
                nickname: nn(b.nickname),
                make: b.make,
                model: b.model,
                serialNumber: b.serialNumber,
                registrationNumber: nn(b.registrationNumber),
                registrationExpiresOn: nn(b.registrationExpiresOn),
                remoteIdMethod: b.remoteIdMethod,
                remoteIdSerial: nn(b.remoteIdSerial),
                takeoffMassKg: nn(b.takeoffMassKg),
                firmwareVersion: nn(b.firmwareVersion),
                status: b.status,
              })
              .where(eq(aircraft.id, a.id))
              .returning();
            return x!;
          }, 'An aircraft with that make and serial number already exists');
          return toAircraft(r);
        });
      },
    );

    app.post(
      '/orgs/:orgId/aircraft/:aircraftId/ground',
      { schema: { tags: ['aircraft'], summary: 'Ground an aircraft (blocks readiness until returned to service)', params: AircraftParams, body: api.GroundAircraftRequest, response: { 200: api.AircraftResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.ground');
        return run(req, oc, async (db) => {
          const a = await aircraftFor(db, req.params.aircraftId);
          if (a.status === 'retired') throw badRequest('A retired aircraft cannot be grounded');
          const [r] = await db.update(aircraft).set({ status: 'grounded', groundedReason: req.body.reason }).where(eq(aircraft.id, a.id)).returning();
          return toAircraft(r!);
        });
      },
    );

    app.post(
      '/orgs/:orgId/aircraft/:aircraftId/return-to-service',
      { schema: { tags: ['aircraft'], summary: 'Clear a grounding; the reason is recorded as a maintenance event', params: AircraftParams, body: api.GroundAircraftRequest, response: { 200: api.AircraftResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.ground');
        return run(req, oc, async (db) => {
          const a = await aircraftFor(db, req.params.aircraftId);
          if (a.status !== 'grounded') throw badRequest('Aircraft is not grounded');
          await db.insert(maintenanceEvents).values({
            id: newId(),
            kind: 'unscheduled',
            targetType: 'aircraft',
            targetId: a.id,
            performedAt: new Date().toISOString(),
            performedBy: req.user?.name ?? 'Unknown',
            description: `Returned to service: ${req.body.reason} (was grounded: ${a.groundedReason ?? 'no reason recorded'})`,
            flightSecondsAtService: a.totalFlightSeconds,
          });
          const [r] = await db.update(aircraft).set({ status: 'active', groundedReason: null }).where(eq(aircraft.id, a.id)).returning();
          return toAircraft(r!);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/aircraft/:aircraftId',
      { schema: { tags: ['aircraft'], summary: 'Archive an aircraft (flights are kept)', params: AircraftParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        await run(req, oc, async (db) => {
          const a = await aircraftFor(db, req.params.aircraftId);
          await db.update(aircraft).set({ deletedAt: sql`now()` }).where(eq(aircraft.id, a.id));
        });
        return reply.status(204).send(null);
      },
    );

    // ---------------------------------------------------------------- batteries
    const batteryFor = async (db: Db, id: string) => {
      const [b] = await db.select().from(batteries).where(and(eq(batteries.id, id), isNull(batteries.deletedAt)));
      if (!b) throw notFound('Battery');
      return b;
    };
    const thresholds = (t: Partial<api.CreateBatteryRequest['thresholds'] & object> | undefined, prev?: (typeof batteries.$inferSelect)['thresholds']) => ({
      maxCycles: t?.maxCycles !== undefined ? t.maxCycles : (prev?.maxCycles ?? null),
      minCapacityPct: t?.minCapacityPct !== undefined ? t.minCapacityPct : (prev?.minCapacityPct ?? null),
      maxCellDeviationMv: t?.maxCellDeviationMv !== undefined ? t.maxCellDeviationMv : (prev?.maxCellDeviationMv ?? null),
      maxAgeDays: t?.maxAgeDays !== undefined ? t.maxAgeDays : (prev?.maxAgeDays ?? null),
    });

    app.post(
      '/orgs/:orgId/batteries',
      { schema: { tags: ['batteries'], params: OrgParams, body: api.CreateBatteryRequest, response: { 201: api.BatteryResponse, 409: api.ErrorResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'batteries.manage');
        const b = req.body;
        const row = await run(req, oc, (db) =>
          uniquely(async () => {
            const [r] = await db
              .insert(batteries)
              .values({ id: newId(), serialNumber: b.serialNumber, label: b.label ?? null, chemistry: b.chemistry, cellCount: b.cellCount ?? null, ratedCapacityMah: b.ratedCapacityMah ?? null, aircraftModel: b.aircraftModel ?? null, purchasedOn: b.purchasedOn ?? null, thresholds: thresholds(b.thresholds), notes: b.notes ?? null })
              .returning();
            return r!;
          }, 'A battery with that serial number already exists'),
        );
        return reply.status(201).send(toBattery(row));
      },
    );

    app.patch(
      '/orgs/:orgId/batteries/:batteryId',
      { schema: { tags: ['batteries'], params: BatteryParams, body: api.UpdateBatteryRequest, response: { 200: api.BatteryResponse, 409: api.ErrorResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'batteries.manage');
        const b = req.body;
        return run(req, oc, async (db) => {
          const cur = await batteryFor(db, req.params.batteryId);
          const r = await uniquely(async () => {
            const [x] = await db
              .update(batteries)
              .set({ serialNumber: b.serialNumber, label: nn(b.label), chemistry: b.chemistry, cellCount: nn(b.cellCount), ratedCapacityMah: nn(b.ratedCapacityMah), aircraftModel: nn(b.aircraftModel), purchasedOn: nn(b.purchasedOn), thresholds: b.thresholds ? thresholds(b.thresholds, cur.thresholds) : undefined, notes: nn(b.notes), status: b.status })
              .where(eq(batteries.id, cur.id))
              .returning();
            return x!;
          }, 'A battery with that serial number already exists');
          return toBattery(r);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/batteries/:batteryId',
      { schema: { tags: ['batteries'], params: BatteryParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'batteries.manage');
        await run(req, oc, async (db) => {
          const cur = await batteryFor(db, req.params.batteryId);
          await db.update(batteries).set({ deletedAt: sql`now()` }).where(eq(batteries.id, cur.id));
        });
        return reply.status(204).send(null);
      },
    );

    // ---------------------------------------------------------------- insurance
    const replaceCoverage = async (db: Db, policyId: string, aircraftIds: string[]) => {
      await db.delete(insuranceCoveredAircraft).where(eq(insuranceCoveredAircraft.policyId, policyId));
      const unique = [...new Set(aircraftIds)];
      for (const id of unique) await aircraftFor(db, id);
      if (unique.length) await db.insert(insuranceCoveredAircraft).values(unique.map((aircraftId) => ({ policyId, aircraftId })));
      return unique;
    };

    app.post(
      '/orgs/:orgId/insurance',
      { schema: { tags: ['insurance'], params: OrgParams, body: api.CreateInsurancePolicyRequest, response: { 201: api.InsurancePolicyResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        const b = req.body;
        if (b.expiresOn < b.effectiveOn) throw badRequest('Expiry date is before the effective date');
        const res = await run(req, oc, async (db) => {
          const [p] = await db
            .insert(insurancePolicies)
            .values({ id: newId(), carrier: b.carrier, policyNumber: b.policyNumber, coverageSummary: b.coverageSummary ?? null, liabilityLimitCents: b.liabilityLimitCents ?? null, effectiveOn: b.effectiveOn, expiresOn: b.expiresOn })
            .returning();
          const covered = await replaceCoverage(db, p!.id, b.coveredAircraftIds);
          return toInsurancePolicy(p!, covered);
        });
        return reply.status(201).send(res);
      },
    );

    app.patch(
      '/orgs/:orgId/insurance/:policyId',
      { schema: { tags: ['insurance'], params: PolicyParams, body: api.UpdateInsurancePolicyRequest, response: { 200: api.InsurancePolicyResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        const b = req.body;
        return run(req, oc, async (db) => {
          const [cur] = await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, req.params.policyId), isNull(insurancePolicies.deletedAt)));
          if (!cur) throw notFound('Insurance policy');
          const eff = b.effectiveOn ?? cur.effectiveOn;
          const exp = b.expiresOn ?? cur.expiresOn;
          if (exp < eff) throw badRequest('Expiry date is before the effective date');
          const [p] = await db
            .update(insurancePolicies)
            .set({ carrier: b.carrier, policyNumber: b.policyNumber, coverageSummary: nn(b.coverageSummary), liabilityLimitCents: nn(b.liabilityLimitCents), effectiveOn: b.effectiveOn, expiresOn: b.expiresOn })
            .where(eq(insurancePolicies.id, cur.id))
            .returning();
          const covered = b.coveredAircraftIds
            ? await replaceCoverage(db, cur.id, b.coveredAircraftIds)
            : (await db.select().from(insuranceCoveredAircraft).where(eq(insuranceCoveredAircraft.policyId, cur.id))).map((c) => c.aircraftId);
          return toInsurancePolicy(p!, covered);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/insurance/:policyId',
      { schema: { tags: ['insurance'], params: PolicyParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        await run(req, oc, async (db) => {
          const [r] = await db.update(insurancePolicies).set({ deletedAt: sql`now()` }).where(and(eq(insurancePolicies.id, req.params.policyId), isNull(insurancePolicies.deletedAt))).returning({ id: insurancePolicies.id });
          if (!r) throw notFound('Insurance policy');
        });
        return reply.status(204).send(null);
      },
    );

    // ---------------------------------------------------------------- maintenance
    /** Current usage of a maintenance target, used to stamp "last done at" on a schedule. */
    const targetUsage = async (db: Db, t: { type: 'aircraft' | 'component' | 'battery'; id: string }) => {
      if (t.type === 'aircraft') {
        const a = await aircraftFor(db, t.id);
        return { flightSeconds: a.totalFlightSeconds, flights: a.totalFlights };
      }
      if (t.type === 'battery') {
        const b = await batteryFor(db, t.id);
        return { flightSeconds: 0, flights: b.cycleCount };
      }
      const [c] = await db.select().from(components).where(and(eq(components.id, t.id), isNull(components.deletedAt)));
      if (!c) throw notFound('Component');
      return { flightSeconds: c.flightSeconds, flights: c.cycles };
    };

    app.post(
      '/orgs/:orgId/maintenance/schedules',
      { schema: { tags: ['maintenance'], params: OrgParams, body: api.CreateMaintenanceScheduleRequest, response: { 201: api.MaintenanceScheduleResponse } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'maintenance.manage');
        const b = req.body;
        if (!b.everyDays && !b.everyFlights && !b.everyFlightSeconds) throw badRequest('Set at least one interval (days, flights, or flight hours)');
        const row = await run(req, oc, async (db) => {
          const usage = await targetUsage(db, b.target);
          const [r] = await db
            .insert(maintenanceSchedules)
            .values({
              id: newId(),
              name: b.name,
              targetType: b.target.type,
              targetId: b.target.id,
              everyFlightSeconds: b.everyFlightSeconds ?? null,
              everyFlights: b.everyFlights ?? null,
              everyDays: b.everyDays ?? null,
              // A new schedule starts counting from now.
              lastDoneAt: new Date().toISOString(),
              lastDoneFlightSeconds: usage.flightSeconds,
              lastDoneFlights: usage.flights,
              groundsWhenOverdue: b.groundsWhenOverdue,
            })
            .returning();
          return r!;
        });
        return reply.status(201).send(toMaintenanceSchedule(row));
      },
    );

    app.delete(
      '/orgs/:orgId/maintenance/schedules/:scheduleId',
      { schema: { tags: ['maintenance'], params: ScheduleParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'maintenance.manage');
        await run(req, oc, async (db) => {
          const [r] = await db.update(maintenanceSchedules).set({ deletedAt: sql`now()` }).where(and(eq(maintenanceSchedules.id, req.params.scheduleId), isNull(maintenanceSchedules.deletedAt))).returning({ id: maintenanceSchedules.id });
          if (!r) throw notFound('Maintenance schedule');
        });
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/orgs/:orgId/maintenance/events',
      { schema: { tags: ['maintenance'], params: OrgParams, querystring: z.object({ targetId: Id.optional() }), response: { 200: api.MaintenanceEventListResponse } } },
      async (req) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'maintenance.read');
        return run(req, oc, async (db) => {
          const rows = await db
            .select()
            .from(maintenanceEvents)
            .where(and(isNull(maintenanceEvents.deletedAt), req.query.targetId ? eq(maintenanceEvents.targetId, req.query.targetId) : undefined))
            .orderBy(desc(maintenanceEvents.performedAt))
            .limit(200);
          return {
            events: rows.map((e) => ({
              id: e.id,
              orgId: e.orgId,
              createdAt: iso(e.createdAt),
              updatedAt: iso(e.updatedAt),
              createdBy: e.createdBy,
              deletedAt: iso(e.deletedAt),
              kind: e.kind,
              scheduleId: e.scheduleId,
              target: { type: e.targetType, id: e.targetId },
              performedAt: iso(e.performedAt),
              performedBy: e.performedBy,
              description: e.description,
              partsReplaced: e.partsReplaced,
              flightSecondsAtService: e.flightSecondsAtService,
              signedOffByUserId: e.signedOffByUserId,
              signedOffAt: iso(e.signedOffAt),
              documentIds: [],
            })),
          };
        });
      },
    );

    app.post(
      '/orgs/:orgId/maintenance/events',
      { schema: { tags: ['maintenance'], summary: 'Log maintenance; completing a scheduled item resets its interval', params: OrgParams, body: api.LogMaintenanceRequest, response: { 201: z.object({ id: Id }) } } },
      async (req, reply) => {
        const oc = await org(req, req.params.orgId);
        authorize(oc, 'maintenance.manage');
        const b = req.body;
        const id = await run(req, oc, async (db) => {
          const usage = await targetUsage(db, b.target);
          const eventId = newId();
          await db.insert(maintenanceEvents).values({
            id: eventId,
            kind: b.scheduleId ? 'scheduled' : 'unscheduled',
            scheduleId: b.scheduleId ?? null,
            targetType: b.target.type,
            targetId: b.target.id,
            performedAt: b.performedAt,
            performedBy: b.performedBy,
            description: b.description,
            partsReplaced: b.partsReplaced,
            flightSecondsAtService: usage.flightSeconds,
            signedOffByUserId: oc.userId,
            signedOffAt: new Date().toISOString(),
          });
          if (b.scheduleId) {
            const [s] = await db
              .update(maintenanceSchedules)
              .set({ lastDoneAt: b.performedAt, lastDoneFlightSeconds: usage.flightSeconds, lastDoneFlights: usage.flights })
              .where(and(eq(maintenanceSchedules.id, b.scheduleId), eq(maintenanceSchedules.targetId, b.target.id), isNull(maintenanceSchedules.deletedAt)))
              .returning({ id: maintenanceSchedules.id });
            if (!s) throw notFound('Maintenance schedule');
          }
          return eventId;
        });
        return reply.status(201).send({ id });
      },
    );
  };
