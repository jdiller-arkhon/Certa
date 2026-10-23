'use client';

import { type api as apiTypes, buildLogFlight, can, displayInstant, formatDuration, formatLength, formatSpeed } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ensureOk, messageOf } from '@/data/fleet';
import { liveKeys, useLiveOverview, useLiveTrack } from '@/data/live';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { LiveScreen, type LiveAircraftCard } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

/** A flight with no frame for this long shows "No signal" (the server ends it after two minutes). */
const STALE_MS = 10_000;
const WEEK_MS = 7 * 86_400_000;

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Only the track is fetched separately; the card's numbers come from the overview's last frame. */
function useTracks(orgId: string, open: apiTypes.LiveSession[]) {
  // Hooks need a fixed count, so tracks are fetched for at most four aircraft at once.
  const ids = open.slice(0, 4).map((s) => s.id);
  const t0 = useLiveTrack(orgId, ids[0] ?? '', !!ids[0]);
  const t1 = useLiveTrack(orgId, ids[1] ?? '', !!ids[1]);
  const t2 = useLiveTrack(orgId, ids[2] ?? '', !!ids[2]);
  const t3 = useLiveTrack(orgId, ids[3] ?? '', !!ids[3]);
  const all = [t0, t1, t2, t3];
  return new Map(ids.map((id, i) => [id, (all[i]!.data?.points ?? []).map(([lon, lat]) => [lon, lat] as [number, number])]));
}

/** /live: drones streaming right now, flights that need a drone or pilot, and linking. */
export function LiveContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const qc = useQueryClient();
  const overview = useLiveOverview(f.orgId);
  const now = useNow(1000);
  const sessions = overview.data?.sessions ?? [];
  const open = sessions.filter((s) => s.status === 'open');
  const tracks = useTracks(f.orgId, open);
  const [busy, setBusy] = useState<string | null>(null);
  const done = { onSettled: () => { setBusy(null); void qc.invalidateQueries({ queryKey: liveKeys.overview(f.orgId) }); } };
  const assign = useMutation({
    mutationFn: async (v: { id: string; aircraftId: string; pilotId: string }) =>
      unwrap(await api.POST('/api/v1/orgs/{orgId}/live/sessions/{sessionId}/assign', { params: { path: { orgId: f.orgId, sessionId: v.id } }, body: { aircraftId: v.aircraftId, pilotId: v.pilotId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['org', f.orgId, 'flights'] }),
    ...done,
  });
  const discard = useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST('/api/v1/orgs/{orgId}/live/sessions/{sessionId}/discard', { params: { path: { orgId: f.orgId, sessionId: id } } })),
    ...done,
  });
  const unlink = useMutation({
    mutationFn: async (id: string) => ensureOk(await api.DELETE('/api/v1/orgs/{orgId}/live/devices/{deviceId}', { params: { path: { orgId: f.orgId, deviceId: id } } })),
    ...done,
  });
  const built = useMemo(() => (f.bi ? buildLogFlight(f.bi, { currentPilotId: f.myPilotId, now: new Date() }) : null), [f.bi, f.myPilotId]);
  if (!f.bi || !built) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;

  const s = f.bi.snapshot;
  const units = f.mapCtx.units;
  const zone = f.mapCtx.orgTimeZone;
  const aircraftById = new Map(s.aircraft.map((a) => [a.id, a]));
  const aircraftBySerial = new Map(s.aircraft.filter((a) => !a.deletedAt && a.serialNumber).map((a) => [a.serialNumber!.toUpperCase(), a]));
  const pilotLabel = (id: string | null) => (id ? (built.pilotOptions.find((o) => o.value === id)?.label ?? null) : null);
  const nameOf = (x: { aircraftId: string | null; aircraftSn: string; model: string | null }) => {
    const a = (x.aircraftId ? aircraftById.get(x.aircraftId) : null) ?? aircraftBySerial.get(x.aircraftSn.toUpperCase());
    if (a) return a.nickname || `${a.make} ${a.model}`;
    return `${x.model ?? 'Drone'} · SN ${x.aircraftSn}`;
  };
  const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)} min ago`);
  const when = (iso: string) => displayInstant(iso, zone, f.mapCtx.now).absolute;

  const flying: LiveAircraftCard[] = open.map((x) => {
    const fr = x.lastFrame;
    const sinceFrame = now - Date.parse(x.lastFrameAt);
    const stats = [
      { label: 'Flight time', value: formatDuration(Math.max(0, (now - Date.parse(x.startedAt)) / 1000)).display },
      { label: 'Height', value: fr?.heightM != null ? formatLength(Math.max(0, fr.heightM), units).display : '—' },
      { label: 'Speed', value: fr?.speedMps != null ? formatSpeed(fr.speedMps, units).display : '—' },
      { label: 'From home', value: fr?.homeDistanceM != null ? formatLength(fr.homeDistanceM, units).display : '—' },
    ];
    const pct = fr?.batteryPct ?? null;
    const packs = (fr?.packs ?? []).map((p, i) => [`Pack ${i + 1}`, p.pct != null ? `${Math.round(p.pct)}%` : null, p.voltageV != null ? `${p.voltageV.toFixed(1)} V` : null, p.tempC != null ? `${Math.round(p.tempC)}°C` : null].filter(Boolean).join(' '));
    const extras: LiveAircraftCard['extras'] = [];
    if (fr?.gpsSats != null) extras.push({ icon: 'gps', text: `${fr.gpsSats} satellites` });
    if (fr?.windMps != null) extras.push({ icon: 'wind', text: `Wind ${formatSpeed(fr.windMps, units).display}` });
    return {
      id: x.id,
      name: nameOf(x),
      pilot: pilotLabel(x.pilotId),
      mode: fr?.modeLabel ?? (fr?.airborne ? 'Flying' : 'On the ground'),
      stale: sinceFrame > STALE_MS,
      updated: ago(sinceFrame),
      stats,
      battery: pct != null || packs.length ? { pct: pct != null ? Math.round(pct) : null, level: pct == null ? 'amber' : pct <= 20 ? 'red' : pct <= 35 ? 'amber' : 'green', packs } : null,
      extras,
      track: tracks.get(x.id) ?? (fr?.lon != null && fr.lat != null ? [[fr.lon, fr.lat]] : []),
    };
  });
  const review = sessions
    .filter((x) => x.status === 'needs_aircraft')
    .map((x) => ({ id: x.id, title: nameOf(x), when: `${when(x.startedAt)} · ${formatDuration((Date.parse(x.endedAt ?? x.lastFrameAt) - Date.parse(x.startedAt)) / 1000).display}`, aircraftId: x.aircraftId ?? aircraftBySerial.get(x.aircraftSn.toUpperCase())?.id ?? '', pilotId: x.pilotId ?? '' }));
  const logged = sessions
    .filter((x) => x.status === 'logged' && x.flightId && now - Date.parse(x.endedAt ?? x.lastFrameAt) < WEEK_MS)
    .map((x) => ({ id: x.id, title: nameOf(x), when: when(x.startedAt), flightId: x.flightId! }));
  const devices = (overview.data?.devices ?? []).map((d) => {
    const a = d.kind === 'aircraft' ? aircraftBySerial.get(d.sn.toUpperCase()) : null;
    return {
      id: d.id,
      kind: d.kind,
      title: a ? a.nickname || `${a.make} ${a.model}` : d.kind === 'gateway' ? `${d.model ?? 'Controller'} · SN ${d.sn}` : `${d.model ?? 'Drone'} · SN ${d.sn}`,
      sub: [d.kind === 'gateway' ? 'Controller' : 'Drone', pilotLabel(d.pilotId), d.lastSeenAt ? `last seen ${when(d.lastSeenAt)}` : 'not seen yet'].filter(Boolean).join(' · '),
      canUnlink: can(f.role, 'flights.log', { actorPilotId: f.myPilotId, resourcePilotId: d.pilotId }),
    };
  });
  const err = assign.error ?? discard.error ?? unlink.error;

  return (
    <LiveScreen
      djiEnabled={overview.data?.djiEnabled ?? false}
      linkUrl={typeof window === 'undefined' ? withBase('/live/link') : `${window.location.origin}${withBase('/live/link')}`}
      flying={flying}
      review={review}
      logged={logged}
      devices={devices}
      aircraftOptions={built.aircraftOptions.map((o) => ({ value: o.value, label: o.label }))}
      pilotOptions={built.pilotOptions.map((o) => ({ value: o.value, label: o.label }))}
      error={err ? messageOf(err) : overview.error ? 'We couldn’t load live flights.' : null}
      busy={busy}
      onAssign={(id, aircraftId, pilotId) => { setBusy(id); assign.mutate({ id, aircraftId, pilotId }); }}
      onDiscard={(id) => { setBusy(id); discard.mutate(id); }}
      onUnlink={(id) => { setBusy(id); unlink.mutate(id); }}
      onOpenFlight={(id) => router.push(`/flights/${id}`)}
      onImport={() => router.push('/flights/import')}
    />
  );
}
