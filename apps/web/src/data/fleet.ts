'use client';

import { FleetSnapshot, type api as apiTypes, type ChecklistTemplate, type Flight, type MaintenanceEvent } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { networkFirst } from './offline';

export const fleetKeys = {
  fleet: (orgId: string) => ['org', orgId, 'fleet'] as const,
  flights: (orgId: string, filter?: object) => (filter ? (['org', orgId, 'flights', filter] as const) : (['org', orgId, 'flights'] as const)),
  flight: (orgId: string, flightId: string) => ['org', orgId, 'flight', flightId] as const,
  maintenanceEvents: (orgId: string) => ['org', orgId, 'maintenance-events'] as const,
  checklists: (orgId: string) => ['org', orgId, 'checklists'] as const,
  authorizations: (orgId: string) => ['org', orgId, 'authorizations'] as const,
};

/** The fleet snapshot every Phase 2 screen is built from; cached for offline use. */
export function useFleet(orgId: string) {
  return useQuery({
    queryKey: fleetKeys.fleet(orgId),
    queryFn: () =>
      networkFirst(`fleet:${orgId}`, async () => {
        const raw = unwrap(await api.GET('/api/v1/orgs/{orgId}/fleet', { params: { path: { orgId } } }));
        return FleetSnapshot.parse(raw);
      }),
  });
}

export interface FlightFilter {
  pilotId: string | null;
  aircraftId: string | null;
  from: string | null;
  to: string | null;
}

export function useFlights(orgId: string, filter: FlightFilter, opts: { limit?: number } = {}) {
  return useInfiniteQuery({
    queryKey: fleetKeys.flights(orgId, { ...filter, limit: opts.limit ?? 50 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      networkFirst(`flights:${orgId}:${JSON.stringify(filter)}:${pageParam ?? ''}`, async () =>
        unwrap(
          await api.GET('/api/v1/orgs/{orgId}/flights', {
            params: {
              path: { orgId },
              query: {
                cursor: pageParam,
                limit: opts.limit ?? 50,
                pilotId: filter.pilotId ?? undefined,
                aircraftId: filter.aircraftId ?? undefined,
                from: filter.from ?? undefined,
                to: filter.to ?? undefined,
              },
            },
          }),
        ),
      ) as Promise<apiTypes.FlightListResponse>,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Most recent flights (one page), for detail screens. */
export function useRecentFlights(orgId: string, filter: Partial<FlightFilter>) {
  const q = useFlights(orgId, { pilotId: null, aircraftId: null, from: null, to: null, ...filter }, { limit: 10 });
  return { ...q, flights: (q.data?.pages[0]?.items ?? []) as Flight[] };
}

export function useFlight(orgId: string, flightId: string) {
  return useQuery({
    queryKey: fleetKeys.flight(orgId, flightId),
    enabled: !!flightId,
    queryFn: () =>
      networkFirst(`flight:${orgId}:${flightId}`, async () =>
        unwrap(await api.GET('/api/v1/orgs/{orgId}/flights/{flightId}', { params: { path: { orgId, flightId } } })),
      ) as Promise<apiTypes.FlightWithGoNoGo>,
  });
}

export function useMaintenanceEvents(orgId: string) {
  return useQuery({
    queryKey: fleetKeys.maintenanceEvents(orgId),
    queryFn: () =>
      networkFirst(`maintenance-events:${orgId}`, async () =>
        unwrap(await api.GET('/api/v1/orgs/{orgId}/maintenance/events', { params: { path: { orgId } } })),
      ).then((r) => r.events as MaintenanceEvent[]),
  });
}

/** Checklist templates, cached on the device so a pilot can tick the list without signal. */
export function useChecklistTemplates(orgId: string) {
  return useQuery({
    queryKey: fleetKeys.checklists(orgId),
    queryFn: () =>
      networkFirst(`checklists:${orgId}`, async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/checklists/templates', { params: { path: { orgId } } }))).then((r) => r.templates as ChecklistTemplate[]),
  });
}

/** LAANC approvals, waivers and COAs, cached on the device for logging offline. */
export function useAuthorizations(orgId: string) {
  return useQuery({
    queryKey: fleetKeys.authorizations(orgId),
    queryFn: () =>
      networkFirst(`authorizations:${orgId}`, async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/authorizations', { params: { path: { orgId } } }))).then((r) => r.authorizations as apiTypes.AuthorizationRecord[]),
  });
}

/** The template pilots tick while logging: the default pre-flight list, else the first pre-flight list. */
export const defaultPreflight = (ts: ChecklistTemplate[] | undefined) => ts?.find((t) => t.kind === 'preflight' && t.isDefault) ?? ts?.find((t) => t.kind === 'preflight') ?? null;

/** Field errors from a 400 (Zod issues → { field: message }). */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  if (!(err instanceof CertaApiError) || err.status !== 400 || !Array.isArray(err.details)) return {};
  // Fastify validation errors: [{ instancePath: '/email', message }].
  const out: Record<string, string> = {};
  for (const v of err.details as { instancePath?: string; message?: string }[]) {
    const key = v.instancePath?.split('/')[1];
    if (key && v.message && !out[key]) out[key] = v.message;
  }
  return out;
}

export const messageOf = (err: unknown, fallback = 'Could not save the change.') =>
  err instanceof CertaApiError ? err.message : err instanceof TypeError ? 'No connection. Try again when you’re back online.' : fallback;

/**
 * A mutation that refreshes the fleet snapshot (and flights) afterwards and exposes a
 * human-readable error. Every Phase 2 write goes through this.
 */
export function useFleetMutation<V, R>(orgId: string, fn: (v: V) => Promise<R>, opts: { onSuccess?: (r: R, v: V) => void; flights?: boolean; maintenance?: boolean } = {}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: fn,
    onSuccess: async (r, v) => {
      setError(null);
      setFieldErrors({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: fleetKeys.fleet(orgId) }),
        opts.flights ? qc.invalidateQueries({ queryKey: fleetKeys.flights(orgId) }) : null,
        opts.maintenance ? qc.invalidateQueries({ queryKey: fleetKeys.maintenanceEvents(orgId) }) : null,
      ]);
      opts.onSuccess?.(r, v);
    },
    onError: (err) => {
      setError(messageOf(err));
      setFieldErrors(fieldErrorsOf(err));
    },
  });
  return { ...m, error, fieldErrors, clearError: () => setError(null) };
}

/** Throws a CertaApiError for a non-2xx response with no body (DELETE → 204). */
export function ensureOk(r: { response: Response; error?: unknown; data?: unknown }) {
  if (!r.response.ok) unwrap(r);
}
