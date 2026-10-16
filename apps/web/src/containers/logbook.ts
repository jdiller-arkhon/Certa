'use client';

import { fleetNames, OPERATION_TYPE_LABEL, type api as apiTypes, type BuildInput } from '@certa/core';
import { unwrap } from '@certa/sdk';
import { api } from '@/lib/api';
import { download } from './_fleet';

export const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Quote everything; neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Every flight matching the filter, as a CSV logbook download. */
export async function exportLogbook(orgId: string, bi: BuildInput, filter: { pilotId?: string; aircraftId?: string }, name: string) {
  const flights: apiTypes.FlightListResponse['items'] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap(await api.GET('/api/v1/orgs/{orgId}/flights', { params: { path: { orgId }, query: { ...filter, cursor, limit: 200 } } }));
    flights.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const rows = flightsCsvRows(bi, flights);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logbook';
  download(`certa-logbook-${slug}-${bi.ctx.today}.csv`, toCsv(rows));
}

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export function flightsCsvRows(bi: BuildInput, flights: apiTypes.FlightListResponse['items']): unknown[][] {
  const n = fleetNames(bi.snapshot);
  return [
    ['Takeoff (UTC)', 'Landing (UTC)', 'Duration (min)', 'Pilot in command', 'Aircraft', 'Location', 'Max altitude AGL (m)', 'Operation', 'Source', 'Notes'],
    ...flights.map((f) => [f.takeoffAt, f.landingAt, Math.round(f.durationSeconds / 60), n.pilot(f.pilotInCommandId), n.aircraft(f.aircraftId), f.locationName, f.maxAltitudeAglM, OPERATION_TYPE_LABEL[f.operationType] ?? f.operationType, f.source, f.notes]),
  ];
}
