'use client';

import {
  buildFlightDetail,
  buildFlightList,
  buildLogFlight,
  displayInstant,
  fleetNames,
  goNoGo,
  metresTo,
  toMetres,
  type Flight,
  type GoNoGoResult,
  type SyncConflictViewModel,
  type ConditionsResponse,
  weatherSummary,
  withMission,
} from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CloudUpload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { defaultPreflight, ensureOk, fleetKeys, useAuthorizations, useChecklistTemplates, useMission, useFlight, useFleetMutation, useFlights, type FlightFilter } from '@/data/fleet';
import { api } from '@/lib/api';
import { uuidv7 } from '@/lib/idb';
import { discardOutboxItem, enqueueFlight, retryRejected, useOutbox, type OutboxItem } from '@/lib/outbox';
import { FlightDetailScreen, FlightListScreen, LogFlightScreen, SyncConflictsScreen } from '@/screens';
import { download, FleetPending, useFleetContext } from './_fleet';
import { flightsCsvRows, toCsv } from './logbook';

/** An unsynced outbox entry, shaped like a server flight so lists and details can show it. */
export function outboxFlight(i: OutboxItem): Flight & { pendingSync: true } {
  const b = i.body;
  return {
    id: b.id,
    orgId: i.orgId,
    createdAt: i.createdAt,
    updatedAt: i.createdAt,
    createdBy: i.userId,
    deletedAt: null,
    pilotInCommandId: b.pilotInCommandId,
    visualObserverIds: b.visualObserverIds ?? [],
    aircraftId: b.aircraftId,
    batteries: b.batteries ?? [],
    takeoffAt: b.takeoffAt,
    landingAt: b.landingAt,
    localTimeZone: b.localTimeZone,
    takeoffPoint: b.takeoffPoint ?? null,
    landingPoint: null,
    locationName: b.locationName ?? null,
    durationSeconds: Math.max(0, Math.round((Date.parse(b.landingAt) - Date.parse(b.takeoffAt)) / 1000)),
    maxAltitudeAglM: b.maxAltitudeAglM ?? null,
    maxDistanceM: b.maxDistanceM ?? null,
    totalDistanceM: null,
    hasPath: false,
    weather: b.weather ?? null,
    airspaceClass: b.airspaceClass ?? null,
    authorizationId: b.authorizationId ?? null,
    missionId: b.missionId ?? null,
    siteId: null,
    operationType: b.operationType ?? 'commercial',
    notes: b.notes ?? null,
    source: 'manual',
    importParser: null,
    rawLogDocumentId: null,
    pendingSync: true,
  };
}

const NO_FILTER: FlightFilter = { pilotId: null, aircraftId: null, from: null, to: null };

export function FlightListContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const outbox = useOutbox();
  const [filter, setFilter] = useState<FlightFilter>(NO_FILTER);
  const q = useFlights(f.orgId, filter);
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const pages = q.data?.pages ?? [];
  const server = pages.flatMap((p) => p.items) as Flight[];
  const serverIds = new Set(server.map((x) => x.id));
  const pending = outbox.items
    .filter((i) => i.orgId === f.orgId && i.status === 'pending' && !serverIds.has(i.id))
    .map(outboxFlight)
    .filter((x) => (!filter.pilotId || x.pilotInCommandId === filter.pilotId) && (!filter.aircraftId || x.aircraftId === filter.aircraftId));
  const totals = pages[0]?.totals ?? { flights: 0, flightSeconds: 0 };
  const data = buildFlightList(
    f.bi,
    { items: [...pending, ...server], total: (pages[0]?.total ?? 0) + pending.length, nextCursor: pages.at(-1)?.nextCursor ?? null },
    filter,
    { flights: totals.flights + pending.length, flightSeconds: totals.flightSeconds + pending.reduce((s, x) => s + x.durationSeconds, 0) },
  );
  return (
    <FlightListScreen
      {...data}
      loading={q.isLoading || q.isFetchingNextPage}
      error={q.error ? 'We couldn’t load flights.' : f.loadError}
      onFilterChange={setFilter}
      onLoadMore={() => q.fetchNextPage()}
      onLogFlight={() => router.push('/flights/new')}
      onImport={() => router.push('/flights/import')}
      onOpenFlight={(id) => router.push(`/flights/${id}`)}
      onExport={(ids) => {
        const pick = [...pending, ...server].filter((x) => ids.includes(x.id));
        download(`certa-flights-${f.bi!.ctx.today}.csv`, toCsv(flightsCsvRows(f.bi!, pick)));
      }}
    />
  );
}

export function FlightDetailContainer({ flightId }: { flightId: string }) {
  const f = useFleetContext();
  const router = useRouter();
  const outbox = useOutbox();
  const q = useFlight(f.orgId, flightId);
  const auths = useAuthorizations(f.orgId);
  const local = outbox.items.find((i) => i.id === flightId);
  const remove = useFleetMutation(f.orgId, async () => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/flights/{flightId}', { params: { path: { orgId: f.orgId, flightId } } })), {
    flights: true,
    onSuccess: () => router.replace('/flights'),
  });
  if (!f.bi) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  const flight: Flight | null = (q.data as Flight | undefined) ?? (local ? outboxFlight(local) : null);
  const preflight = (q.data?.goNoGo ?? local?.body.goNoGo ?? null) as GoNoGoResult | null;
  const data = buildFlightDetail(f.bi, flight, { preflight, checklist: q.data?.checklist ?? null, authorization: q.data?.authorization ?? auths.data?.find((a) => a.id === flight?.authorizationId) ?? null });
  const notFound = q.error instanceof CertaApiError && q.error.status === 404;
  return (
    <FlightDetailScreen
      {...data}
      // Unsynced flights can't be edited or deleted on the server yet.
      canEdit={data.canEdit && !!q.data}
      loading={(q.isLoading && !local) || remove.isPending}
      error={remove.error ?? (q.error && !local && !notFound ? 'We couldn’t load this flight.' : null)}
      onEdit={() => router.push(`/flights/${flightId}/edit`)}
      onDelete={() => remove.mutate(undefined)}
    />
  );
}

function SavedOnDevice({ onAnother, onView }: { onAnother: () => void; onView: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <EmptyState
        empty={{ title: 'Flight saved on this device', body: 'You’re offline. It syncs automatically when you’re back in coverage — nothing else to do.', actionLabel: 'Log another flight' }}
        icon={<CloudUpload className="size-7" aria-hidden />}
        onAction={onAnother}
        secondary={<Button variant="secondary" onClick={onView}>View flights</Button>}
      />
    </div>
  );
}

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export function LogFlightContainer({ flightId, missionId }: { flightId?: string; missionId?: string }) {
  const f = useFleetContext();
  const mission = useMission(f.orgId, missionId ?? '');
  const router = useRouter();
  const qc = useQueryClient();
  const existing = useFlight(f.orgId, flightId ?? '');
  const templates = useChecklistTemplates(f.orgId);
  const authorizations = useAuthorizations(f.orgId);
  const [selection, setSelection] = useState<{ pilotId: string; aircraftId: string | null; batteryIds: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState<string | null>(null);
  const [conditions, setConditions] = useState<{ status: 'idle' | 'locating' | 'loading' | 'ready' | 'error'; data: ConditionsResponse | null; error: string | null }>({ status: 'idle', data: null, error: null });
  const checkConditions = () => {
    if (!('geolocation' in navigator)) return setConditions({ status: 'error', data: null, error: 'This device can’t share its location.' });
    setConditions((c) => ({ ...c, status: 'locating', error: null }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setConditions((c) => ({ ...c, status: 'loading' }));
        try {
          const lat = Math.round(pos.coords.latitude * 1e5) / 1e5;
          const lon = Math.round(pos.coords.longitude * 1e5) / 1e5;
          const data = unwrap(await api.GET('/api/v1/orgs/{orgId}/conditions', { params: { path: { orgId: f.orgId }, query: { lat, lon } } })) as ConditionsResponse;
          setConditions({ status: 'ready', data, error: null });
        } catch (err) {
          setConditions({ status: 'error', data: null, error: err instanceof TypeError ? 'No connection — conditions need a signal.' : 'Couldn’t check conditions right now.' });
        }
      },
      () => setConditions({ status: 'error', data: null, error: 'Location permission is needed to check conditions here.' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  // If the pilot already allowed location, check conditions as soon as the form opens.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (flightId || autoChecked.current || !navigator.permissions) return;
    autoChecked.current = true;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (p.state === 'granted' && navigator.onLine) checkConditions();
      })
      .catch(() => {});
  }, [flightId]);
  const [formKey, setFormKey] = useState(0);
  const update = useFleetMutation(f.orgId, async (body: Record<string, unknown>) => unwrap(await api.PATCH('/api/v1/orgs/{orgId}/flights/{flightId}', { params: { path: { orgId: f.orgId, flightId: flightId! } }, body: body as never })), {
    flights: true,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fleetKeys.flight(f.orgId, flightId!) });
      router.replace(`/flights/${flightId}`);
    },
  });

  const preflight = useMemo(() => {
    if (!f.bi || !selection?.pilotId || !selection.aircraftId) return null;
    return goNoGo(f.bi.snapshot, { pilotId: selection.pilotId, aircraftId: selection.aircraftId, batteryIds: selection.batteryIds }, f.mapCtx);
  }, [f.bi, f.mapCtx, selection]);

  if (!f.bi || (flightId && existing.isLoading)) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;
  if (savedOffline)
    return (
      <SavedOnDevice
        onAnother={() => {
          setSavedOffline(null);
          setFormKey((k) => k + 1);
        }}
        onView={() => router.push('/flights')}
      />
    );
  // The checklist is ticked when a flight is logged, not when it's edited later.
  const built = buildLogFlight(f.bi, { currentPilotId: f.myPilotId, now: new Date(), checklist: flightId ? null : defaultPreflight(templates.data), authorizations: authorizations.data });
  // Started from a mission: its crew, aircraft, place and authorization fill the form.
  const base = !flightId && mission.data ? withMission(built, mission.data, f.mapCtx) : built;
  const ex = flightId ? (existing.data as Flight | undefined) : undefined;
  const defaults = ex
    ? {
        pilotId: ex.pilotInCommandId,
        aircraftId: ex.aircraftId,
        batteryIds: ex.batteries.map((b) => b.batteryId),
        siteId: null,
        operationType: ex.operationType,
        takeoffAt: ex.takeoffAt,
        durationMinutes: Math.round(ex.durationSeconds / 60),
        locationName: ex.locationName,
        maxAltitude: ex.maxAltitudeAglM == null ? null : Math.round(metresTo(ex.maxAltitudeAglM, f.mapCtx.units.length)),
        notes: ex.notes,
        authorizationId: ex.authorizationId,
      }
    : base.defaults;
  const lengthUnit = f.mapCtx.units.length;

  return (
    <LogFlightScreen
      key={formKey}
      {...base}
      defaults={defaults}
      hasLastFlight={!ex && base.hasLastFlight}
      preflight={preflight}
      conditions={{
        status: conditions.status,
        advisories: conditions.data?.advisories ?? [],
        weatherSummary: weatherSummary(conditions.data?.weather ?? null, f.mapCtx.units),
        checkedAt: conditions.data ? displayInstant(conditions.data.checkedAt, f.mapCtx.orgTimeZone, new Date()) : null,
        error: conditions.error,
      }}
      onCheckConditions={checkConditions}
      loading={false}
      error={error ?? update.error ?? (flightId && !ex ? 'Flight not found, or it hasn’t synced yet.' : null)}
      fieldErrors={update.fieldErrors}
      saving={saving || update.isPending}
      onSelectionChange={setSelection}
      onSameAsLast={() => {}}
      onSubmit={async (v) => {
        const body = {
          pilotInCommandId: v.pilotId,
          aircraftId: v.aircraftId,
          // Keep recorded charge levels for batteries that stay on the flight.
          batteries: v.batteryIds.map((batteryId) => ex?.batteries.find((b) => b.batteryId === batteryId) ?? { batteryId, startPct: null, endPct: null }),
          takeoffAt: v.takeoffAt,
          landingAt: v.landingAt,
          localTimeZone: ex?.localTimeZone ?? deviceZone(),
          locationName: v.locationName,
          maxAltitudeAglM: v.maxAltitude == null ? null : Math.round(toMetres(v.maxAltitude, lengthUnit) * 10) / 10,
          operationType: v.operationType as Flight['operationType'],
          notes: v.notes,
          ...(v.checklist && !ex ? { checklist: v.checklist } : {}),
          ...(v.authorizationId ? { authorizationId: v.authorizationId } : {}),
          ...(base.mission && !ex ? { missionId: base.mission.id } : {}),
          // Conditions checked at the site: keep where and in what weather the flight happened.
          ...(conditions.data && !ex
            ? {
                takeoffPoint: { lat: conditions.data.point.lat, lon: conditions.data.point.lon },
                weather: conditions.data.weather,
                airspaceClass: conditions.data.airspace && conditions.data.airspace !== 'unavailable' ? conditions.data.airspace.class : conditions.data.airspace === null ? ('G' as const) : null,
              }
            : {}),
        };
        if (ex) return update.mutate(body);
        setSaving(true);
        setError(null);
        try {
          const id = uuidv7();
          // Outbox first: the flight is safe on the device even if the request never lands.
          await enqueueFlight(f.orgId, f.me.user.id, { ...body, id, visualObserverIds: [], goNoGo: preflight });
          // Offline, a route change needs the server; confirm in place so the pilot can keep logging.
          if (base.mission) void qc.invalidateQueries({ queryKey: fleetKeys.missions(f.orgId) });
          if (navigator.onLine) router.replace(`/flights/${id}`);
          else setSavedOffline(id);
        } catch {
          setError('Could not save the flight on this device.');
        } finally {
          setSaving(false);
        }
      }}
      onCancel={() => router.back()}
      altitudeUnitLabel={lengthUnit}
    />
  );
}

export function SyncConflictsContainer() {
  const f = useFleetContext();
  const outbox = useOutbox();
  const qc = useQueryClient();
  const n = f.bi ? fleetNames(f.bi.snapshot) : null;
  const conflicts: SyncConflictViewModel[] = outbox.items
    .filter((i) => i.status === 'rejected')
    .map((i) => {
      const at = displayInstant(i.createdAt, f.mapCtx.orgTimeZone, f.mapCtx.now);
      const takeoff = displayInstant(i.body.takeoffAt, i.body.localTimeZone, f.mapCtx.now);
      const minutes = Math.round((Date.parse(i.body.landingAt) - Date.parse(i.body.takeoffAt)) / 60000);
      return {
        id: i.id,
        entityLabel: `Flight · ${takeoff.absolute}`,
        field: 'record',
        fieldLabel: 'New flight',
        localValue: [n?.pilot(i.body.pilotInCommandId), n?.aircraft(i.body.aircraftId), `${minutes} min`, i.body.locationName].filter(Boolean).join(' · '),
        serverValue: i.error ?? 'Rejected',
        localChangedBy: f.me.user.name,
        serverChangedBy: 'Certa server',
        localAt: at,
        serverAt: at,
      };
    });
  return (
    <SyncConflictsScreen
      loading={false}
      error={null}
      conflicts={conflicts}
      empty={{ title: 'Everything is synced', body: 'Flights logged offline appear here only if the server can’t accept them.', actionLabel: null }}
      onResolve={async ({ conflictId, choose }) => {
        if (choose === 'server') await discardOutboxItem(conflictId);
        else await retryRejected(conflictId);
        void qc.invalidateQueries({ queryKey: fleetKeys.flights(f.orgId) });
      }}
    />
  );
}
