'use client';

import {
  addMarker,
  buildLogFlight,
  clock,
  conditionChanges,
  conditionsCheck,
  coordinateText,
  currentSortie,
  daylightLeft,
  DEFAULT_SORTIE_SECONDS,
  discardSortie,
  goNoGo,
  land,
  landBy,
  landedSorties,
  MARKER_LABEL,
  nextBatteries,
  phase,
  setLandingCharge,
  sortieFlight,
  sortieSeconds,
  startSession,
  takeOff,
  totalAirSeconds,
  typicalSortieSeconds,
  weatherSummary,
  withCheck,
  worstLevel,
  type Advisory,
  type ConditionsResponse,
  type FlightSession,
  type GoNoGoResult,
  type MarkerKind,
} from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFlights } from '@/data/fleet';
import { api } from '@/lib/api';
import { uuidv7 } from '@/lib/idb';
import { enqueueFlight } from '@/lib/outbox';
import { FlightModeScreen, type FlightModeLive } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

/** The session lives on the device until it's finished, so a reload or a dead zone loses nothing. */
const KEY = (orgId: string) => `certa.flightMode.${orgId}`;
function loadSession(orgId: string): FlightSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY(orgId)) ?? 'null') as FlightSession | null;
    return s && s.orgId === orgId && Array.isArray(s.sorties) && Array.isArray(s.markers) ? s : null;
  } catch {
    return null;
  }
}
function saveSession(orgId: string, s: FlightSession | null) {
  try {
    if (s) localStorage.setItem(KEY(orgId), JSON.stringify(s));
    else localStorage.removeItem(KEY(orgId));
  } catch {
    /* storage full or blocked: the session still runs in memory */
  }
}

const RECHECK_MS = 10 * 60_000;
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const hm = (seconds: number) => {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

type Conditions = { status: 'idle' | 'locating' | 'loading' | 'ready' | 'error'; data: ConditionsResponse | null; error: string | null };

/** /flights/live: flight mode on site. */
export function FlightModeContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [session, setSessionState] = useState<FlightSession | null>(null);
  const [selection, setSelection] = useState<{ pilotId: string; aircraftId: string | null; batteryIds: string[] } | null>(null);
  const [conditions, setConditions] = useState<Conditions>({ status: 'idle', data: null, error: null });
  const [changes, setChanges] = useState<Advisory[]>([]);
  const [askCharge, setAskCharge] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [wakeLock, setWakeLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goNoGoAtStart = useRef<GoNoGoResult | null>(null);
  const lastAdvisories = useRef<Advisory[] | null>(null);

  useEffect(() => {
    const s = loadSession(f.orgId);
    setSessionState(s);
    setLoaded(true);
  }, [f.orgId]);
  const setSession = useCallback(
    (next: FlightSession | null | ((s: FlightSession) => FlightSession)) =>
      setSessionState((cur) => {
        const v = typeof next === 'function' ? (cur ? next(cur) : cur) : next;
        saveSession(f.orgId, v);
        return v;
      }),
    [f.orgId],
  );

  // A one-second clock while a session runs.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [!!session]);

  // Keep the screen awake on site, and give the big buttons the bottom of a phone screen.
  useEffect(() => {
    if (!session) return;
    document.body.dataset.taskFlow = '';
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = async () => {
      if (!nav.wakeLock) return setWakeLock(false);
      try {
        lock = await nav.wakeLock.request('screen');
        setWakeLock(true);
      } catch {
        setWakeLock(false);
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      delete document.body.dataset.taskFlow;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [!!session]);

  const checkConditions = useCallback(() => {
    if (!('geolocation' in navigator)) return setConditions((c) => ({ ...c, status: 'error', error: 'This device can’t share its location.' }));
    setConditions((c) => ({ ...c, status: 'locating', error: null }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setConditions((c) => ({ ...c, status: 'loading' }));
        try {
          const lat = Math.round(pos.coords.latitude * 1e5) / 1e5;
          const lon = Math.round(pos.coords.longitude * 1e5) / 1e5;
          const data = unwrap(await api.GET('/api/v1/orgs/{orgId}/conditions', { params: { path: { orgId: f.orgId }, query: { lat, lon } } })) as ConditionsResponse;
          // Only bad news interrupts the pilot: new or worse advisories since the last check.
          if (lastAdvisories.current) {
            const worse = conditionChanges(lastAdvisories.current, data.advisories);
            if (worse.length) {
              setChanges((c) => [...c.filter((x) => !worse.some((w) => w.key === x.key)), ...worse]);
              (navigator as Navigator & { vibrate?: (p: number[]) => boolean }).vibrate?.([200, 100, 200]);
            }
          }
          lastAdvisories.current = data.advisories;
          setConditions({ status: 'ready', data, error: null });
          setSession((s) => ({ ...s, point: data.point }));
        } catch (err) {
          setConditions((c) => ({ ...c, status: 'error', error: err instanceof TypeError ? 'No connection. Conditions need a signal; the last check still shows.' : 'Couldn’t check conditions right now.' }));
        }
      },
      () => setConditions((c) => ({ ...c, status: 'error', error: 'Location permission is needed to check conditions here.' })),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [f.orgId, setSession]);

  // Watch conditions while on site: check on start (if location is already allowed), then every 10 minutes.
  useEffect(() => {
    if (!session) return;
    if (!lastAdvisories.current && navigator.permissions)
      navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state === 'granted' && navigator.onLine && checkConditions()).catch(() => {});
    const t = setInterval(() => navigator.onLine && checkConditions(), RECHECK_MS);
    return () => clearInterval(t);
  }, [!!session, checkConditions]);

  const aircraftId = session?.aircraftId ?? selection?.aircraftId ?? null;
  const history = useFlights(f.orgId, { pilotId: null, aircraftId, from: null, to: null }, { limit: 50 });
  const typical = useMemo(() => {
    const durations = (history.data?.pages.flatMap((p) => p.items) ?? []).filter((x) => x.aircraftId === aircraftId).map((x) => x.durationSeconds);
    const t = typicalSortieSeconds(durations);
    return { seconds: t ?? DEFAULT_SORTIE_SECONDS, note: t ? `typical ${clock(t)} for this aircraft` : 'no history yet: 20 min default' };
  }, [history.data, aircraftId]);

  const built = useMemo(() => (f.bi ? buildLogFlight(f.bi, { currentPilotId: f.myPilotId, now: new Date() }) : null), [f.bi, f.myPilotId]);
  const preflight = useMemo(() => {
    if (!f.bi || !selection?.pilotId || !selection.aircraftId) return null;
    const records = goNoGo(f.bi.snapshot, { pilotId: selection.pilotId, aircraftId: selection.aircraftId, batteryIds: selection.batteryIds }, f.mapCtx);
    return withCheck(records, conditionsCheck(conditions.status === 'ready' && conditions.data ? conditions.data.advisories : null));
  }, [f.bi, f.mapCtx, selection, conditions.status, conditions.data]);

  if (!f.bi || !built || !loaded) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;

  const label = (opts: { value: string; label: string }[], id: string) => opts.find((o) => o.value === id)?.label ?? 'Unknown';
  const zone = session?.localTimeZone ?? deviceZone();
  const hhmm = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(iso));

  let live: FlightModeLive | null = null;
  if (session) {
    const cur = currentSortie(session);
    const landed = landedSorties(session);
    const lastLanding = landed.at(-1)?.landingAt;
    const batteryNames = (ids: string[]) => ids.map((b) => label(built.batteryOptions, b)).join(', ');
    const d = conditions.data;
    const counted = d ? d.advisories.filter((a) => a.source !== 'Reminder') : [];
    const dusk = d ? daylightLeft(d.daylight.civilDusk, now) : null;
    const point = session.point ?? d?.point ?? null;
    const coords = point ? coordinateText(point) : null;
    const lb = cur ? landBy(cur, typical.seconds, now) : null;
    const checkedAgo = d ? Math.max(0, Math.round((now.getTime() - Date.parse(d.checkedAt)) / 60_000)) : null;
    live = {
      title: session.locationName ?? 'On site',
      subtitle: `${label(built.aircraftOptions, session.aircraftId)} · ${label(built.pilotOptions, session.pilotId)}`,
      phase: phase(session),
      timer: cur
        ? { label: 'This sortie', value: clock(sortieSeconds(cur, now)) }
        : lastLanding
          ? { label: 'Since landing', value: clock((now.getTime() - Date.parse(lastLanding)) / 1000) }
          : { label: 'Ready to take off', value: '0:00' },
      landBy: lb ? { remaining: lb.remaining >= 0 ? `${clock(lb.remaining)} left` : `${clock(-lb.remaining)} over`, fraction: lb.fraction, level: lb.level, note: typical.note } : null,
      batteries: session.batteryIds.map((b) => ({ ...(built.batteryOptions.find((o) => o.value === b) ?? { value: b, label: 'Battery', status: { level: 'green' as const, label: '' } }), flown: session.sorties.filter((x) => x.batteryIds.includes(b)).length })),
      nextBatteryIds: nextBatteries(session),
      inAir: cur && cur.batteryIds.length ? `On ${batteryNames(cur.batteryIds)}` : null,
      askCharge: askCharge && !cur,
      sorties: session.sorties.map((x, i) => ({
        id: x.id,
        n: i + 1,
        when: `${hhmm(x.takeoffAt)}–${x.landingAt ? hhmm(x.landingAt) : 'now'}`,
        duration: clock(sortieSeconds(x, now)),
        batteries: batteryNames(x.batteryIds),
        charge: x.endPct == null ? null : `${x.endPct}% left`,
        airborne: !x.landingAt,
      })),
      totalAir: clock(totalAirSeconds(session, now)),
      landedCount: landed.length,
      markers: session.markers.map((m) => ({ id: m.id, time: hhmm(m.at), label: MARKER_LABEL[m.kind] })),
      conditions: {
        status: conditions.status,
        summary: d ? (weatherSummary(d.weather, f.mapCtx.units) ?? (counted.length ? counted[0]!.title : 'No advisories')) : null,
        level: d ? worstLevel(counted.map((a) => a.level)) : null,
        checked: checkedAgo == null ? null : checkedAgo === 0 ? 'Checked just now' : `Checked ${checkedAgo} min ago`,
        daylight: d ? (dusk ? `Civil dusk in ${hm(dusk)}` : d.daylight.isDaylight ? null : 'After civil dusk: night rules apply (14 CFR 107.29)') : null,
        error: conditions.error,
      },
      changes,
      emergency: { decimal: coords?.decimal ?? null, dms: coords?.dms ?? null, site: session.locationName, aircraft: label(built.aircraftOptions, session.aircraftId), pilot: label(built.pilotOptions, session.pilotId) },
      wakeLock,
    };
  }

  return (
    <FlightModeScreen
      setup={{
        pilotOptions: built.pilotOptions,
        aircraftOptions: built.aircraftOptions,
        batteryOptions: built.batteryOptions,
        siteOptions: built.siteOptions,
        defaults: { pilotId: built.defaults.pilotId, aircraftId: built.defaults.aircraftId, locationName: built.defaults.locationName },
        preflight,
      }}
      live={live}
      conditionsSetup={{ status: conditions.status, error: conditions.error }}
      saving={saving}
      error={error}
      onSelection={setSelection}
      onCheckConditions={checkConditions}
      onStart={(v) => {
        goNoGoAtStart.current = preflight;
        // Conditions checked during setup are the baseline the watch compares against.
        lastAdvisories.current = conditions.data?.advisories ?? null;
        setSession(
          startSession({ id: uuidv7(), orgId: f.orgId, pilotId: v.pilotId, aircraftId: v.aircraftId, batteryIds: v.batteryIds, locationName: v.locationName, missionId: null, operationType: 'commercial', localTimeZone: deviceZone(), now: new Date() }),
        );
        if (conditions.data) setSession((s) => ({ ...s, point: conditions.data!.point }));
      }}
      onTakeOff={(batteryIds) => {
        setAskCharge(false);
        setSession((s) => takeOff(s, batteryIds, new Date(), uuidv7()));
      }}
      onLand={() => {
        setSession((s) => land(s, new Date()));
        setAskCharge(true);
      }}
      onCharge={(pct) => {
        setSession((s) => setLandingCharge(s, pct));
        setAskCharge(false);
      }}
      onMark={(kind: MarkerKind) => setSession((s) => addMarker(s, kind, new Date(), uuidv7()))}
      onDiscardSortie={(id) => setSession((s) => discardSortie(s, id))}
      onDismissChanges={() => setChanges([])}
      onDiscardSession={() => {
        setSession(null);
        router.push('/flights');
      }}
      onFinish={async (notes) => {
        if (!session) return;
        setSaving(true);
        setError(null);
        try {
          const d = conditions.data;
          for (const sortie of landedSorties(session)) {
            const body = sortieFlight(session, sortie, { id: uuidv7(), notes });
            await enqueueFlight(f.orgId, f.me.user.id, {
              ...body,
              goNoGo: goNoGoAtStart.current,
              ...(d ? { weather: d.weather, airspaceClass: d.airspace && d.airspace !== 'unavailable' ? d.airspace.class : d.airspace === null ? ('G' as const) : null } : {}),
            });
          }
          setSession(null);
          router.push('/flights');
        } catch {
          setError('Could not save the flights on this device. Nothing was lost; try again.');
        } finally {
          setSaving(false);
        }
      }}
      onCancel={() => router.back()}
    />
  );
}
