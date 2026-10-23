'use client';

import {
  batteryFlags,
  buildLogFlight,
  formatDuration,
  formatLength,
  isLikelyDuplicate,
  LOG_FORMATS,
  LogReadError,
  matchAircraft,
  matchBatteries,
  PARSER_LABEL,
  parseFlightLog,
  summarizeTelemetry,
  telemetryDedupeKey,
  type TelemetrySummary,
  type TrackPoint,
} from '@certa/core';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useFlights } from '@/data/fleet';
import { uuidv7 } from '@/lib/idb';
import { enqueueFlight, useOutbox } from '@/lib/outbox';
import { FlightImportScreen, type ImportRow } from '@/screens';
import { FleetPending, useFleetContext } from './_fleet';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
/** Logs larger than this are refused rather than freezing the page. */
const MAX_BYTES = 200 * 1024 * 1024;
type Parsed = { summary: TelemetrySummary; track: TrackPoint[] };

/** /flights/import: logs are parsed here in the browser, then queued like any other flight. */
export function FlightImportContainer() {
  const f = useFleetContext();
  const router = useRouter();
  const outbox = useOutbox();
  const recent = useFlights(f.orgId, { pilotId: null, aircraftId: null, from: null, to: null }, { limit: 200 });
  const [rows, setRows] = useState<ImportRow[]>([]);
  const parsed = useRef(new Map<string, Parsed>());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  // Flights imported on this visit: they may have left the outbox before the flight list refreshes.
  const [importedHere, setImportedHere] = useState<{ aircraftId: string; takeoffAt: string }[]>([]);
  const built = useMemo(() => (f.bi ? buildLogFlight(f.bi, { currentPilotId: f.myPilotId, now: new Date() }) : null), [f.bi, f.myPilotId]);
  if (!f.bi || !built) return <FleetPending error={f.loadError} onRetry={() => f.fleet.refetch()} />;

  const s = f.bi.snapshot;
  const units = f.mapCtx.units;
  const zone = deviceZone();
  const existing = [...(recent.data?.pages.flatMap((p) => p.items) ?? []), ...outbox.items.map((i) => ({ aircraftId: i.body.aircraftId, takeoffAt: i.body.takeoffAt })), ...importedHere];
  const fleet = s.aircraft.filter((a) => !a.deletedAt).map((a) => ({ id: a.id, make: a.make, model: a.model, serialNumber: a.serialNumber, retired: a.status === 'retired' }));
  const packs = s.batteries.filter((b) => !b.deletedAt).map((b) => ({ id: b.id, serialNumber: b.serialNumber, retired: b.status === 'retired' }));
  const patch = (key: string, p: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const rowFrom = (key: string, fileName: string, { summary }: Parsed): Partial<ImportRow> => {
    const link = matchAircraft(summary, fleet);
    const dt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: zone }).format(new Date(iso));
    const stats = [
      { label: 'Duration', value: formatDuration(summary.durationSeconds).display },
      ...(summary.maxHeightM != null ? [{ label: 'Max height', value: formatLength(Math.max(0, summary.maxHeightM), units).display }] : []),
      ...(summary.maxDistanceM != null ? [{ label: 'Farthest', value: formatLength(summary.maxDistanceM, units).display }] : []),
      ...(summary.totalDistanceM != null ? [{ label: 'Distance', value: formatLength(summary.totalDistanceM, units).display }] : []),
      ...(summary.battery.startPct != null && summary.battery.endPct != null ? [{ label: 'Battery', value: `${summary.battery.startPct}% → ${summary.battery.endPct}%` }] : []),
    ];
    const flags = batteryFlags(summary.battery);
    const b = summary.battery;
    const cellText = b.minCellV != null ? `Lowest cell ${b.minCellV.toFixed(2)} V${b.maxCellDeltaV != null ? `, cells within ${Math.round(b.maxCellDeltaV * 1000)} mV` : ''}` : null;
    const aircraftId = link?.id ?? '';
    return {
      status: 'ready',
      source: PARSER_LABEL[summary.parser] ?? summary.parser,
      when: `${dt(summary.takeoffAt, { month: 'short', day: 'numeric', year: 'numeric' })} · ${dt(summary.takeoffAt, { hour: 'numeric', minute: '2-digit' })} – ${dt(summary.landingAt, { hour: 'numeric', minute: '2-digit' })}`,
      stats,
      battery: cellText || flags.notes.length ? { level: flags.level, text: [cellText, ...flags.notes.filter((n) => !n.startsWith('A cell'))].filter(Boolean).join(' · ') } : null,
      events: summary.events.length,
      warnings: summary.warnings,
      logAircraft: [summary.aircraftModel, summary.aircraftSerial ? `SN ${summary.aircraftSerial}` : null].filter(Boolean).join(' · ') || null,
      aircraftId,
      linkedBy: link?.by ?? null,
      batteryId: matchBatteries(summary.batterySerials, packs)[0] ?? '',
      duplicate: !!aircraftId && isLikelyDuplicate(summary.takeoffAt, aircraftId, existing),
      include: !(aircraftId && isLikelyDuplicate(summary.takeoffAt, aircraftId, existing)),
      key,
      fileName,
    };
  };

  const onFiles = async (files: File[]) => {
    setDone(null);
    const fresh = files.map((file) => ({ key: uuidv7(), file }));
    setRows((rs) => [
      ...rs,
      ...fresh.map(({ key, file }) => ({ key, fileName: file.name, status: 'reading' as const, error: null, source: null, when: null, stats: [], battery: null, events: 0, warnings: [], logAircraft: null, aircraftId: '', linkedBy: null, pilotId: built.defaults.pilotId, batteryId: '', include: true, duplicate: false })),
    ]);
    for (const { key, file } of fresh) {
      // Let the "Reading…" state paint before a large log ties up the page.
      await new Promise((r) => setTimeout(r, 0));
      try {
        if (file.size > MAX_BYTES) throw new LogReadError('This log is over 200 MB. Trim it to the flight in your ground station and try again.');
        const result = summarizeTelemetry(parseFlightLog(file.name, new Uint8Array(await file.arrayBuffer())));
        if (!result) throw new LogReadError('No flight in this log: the aircraft never left the ground.');
        parsed.current.set(key, result);
        patch(key, rowFrom(key, file.name, result));
      } catch (err) {
        patch(key, { status: 'error', error: err instanceof LogReadError ? err.message : 'Certa couldn’t read this file. It may be damaged or in a format Certa doesn’t support yet.' });
      }
    }
  };

  return (
    <FlightImportScreen
      rows={rows}
      formats={LOG_FORMATS}
      aircraftOptions={built.aircraftOptions.map((o) => ({ value: o.value, label: o.label }))}
      pilotOptions={built.pilotOptions.map((o) => ({ value: o.value, label: o.label }))}
      batteryOptions={built.batteryOptions.map((o) => ({ value: o.value, label: o.label }))}
      saving={saving}
      done={done}
      onFiles={(files) => void onFiles(files)}
      onChange={(key, p) =>
        setRows((rs) =>
          rs.map((r) => {
            if (r.key !== key) return r;
            const next = { ...r, ...p };
            const summary = parsed.current.get(key)?.summary;
            if (p.aircraftId !== undefined && summary) {
              next.linkedBy = null;
              next.duplicate = !!p.aircraftId && isLikelyDuplicate(summary.takeoffAt, p.aircraftId, existing);
              if (next.duplicate) next.include = false;
            }
            return next;
          }),
        )
      }
      onRemove={(key) => setRows((rs) => rs.filter((r) => r.key !== key))}
      onViewFlights={() => router.push('/flights')}
      onImport={async () => {
        setSaving(true);
        let n = 0;
        try {
          for (const r of rows) {
            const p = parsed.current.get(r.key);
            if (!p || r.status !== 'ready' || !r.include || !r.aircraftId || !r.pilotId) continue;
            const { summary, track } = p;
            await enqueueFlight(f.orgId, f.me.user.id, {
              id: uuidv7(),
              pilotInCommandId: r.pilotId,
              visualObserverIds: [],
              aircraftId: r.aircraftId,
              batteries: r.batteryId ? [{ batteryId: r.batteryId, startPct: summary.battery.startPct, endPct: summary.battery.endPct }] : [],
              takeoffAt: summary.takeoffAt,
              landingAt: summary.landingAt,
              localTimeZone: zone,
              operationType: 'commercial',
              maxAltitudeAglM: summary.maxHeightM == null ? null : Math.max(0, summary.maxHeightM),
              maxDistanceM: summary.maxDistanceM,
              totalDistanceM: summary.totalDistanceM,
              track: track.length >= 2 ? track : null,
              telemetry: summary,
              import: { parser: summary.parser, dedupeKey: telemetryDedupeKey(summary, r.aircraftId), warnings: summary.warnings },
            });
            patch(r.key, { status: 'imported', include: false });
            setImportedHere((x) => [...x, { aircraftId: r.aircraftId, takeoffAt: summary.takeoffAt }]);
            n++;
          }
          setDone(n);
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
