/**
 * Linking a log to the fleet: which Certa aircraft flew it and which batteries it used. The
 * serial number in the log is the link; the model is a fallback when exactly one aircraft fits.
 */
const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface LinkableAircraft { id: string; make: string; model: string; serialNumber: string | null; nickname?: string | null; retired?: boolean }
export interface LinkableBattery { id: string; serialNumber: string | null; retired?: boolean }

export function matchAircraft(log: { aircraftSerial: string | null; aircraftModel: string | null }, fleet: LinkableAircraft[]): { id: string; by: 'serial' | 'model' } | null {
  const live = fleet.filter((a) => !a.retired);
  const sn = norm(log.aircraftSerial);
  if (sn.length >= 4) {
    const hit = live.find((a) => norm(a.serialNumber) === sn);
    if (hit) return { id: hit.id, by: 'serial' };
  }
  const model = norm(log.aircraftModel);
  if (model.length >= 3) {
    const fits = live.filter((a) => {
      const m = norm(a.model), mm = norm(`${a.make}${a.model}`);
      return m.length >= 2 && (model.includes(m) || mm.includes(model) || m.includes(model));
    });
    if (fits.length === 1) return { id: fits[0]!.id, by: 'model' };
  }
  return null;
}

export function matchBatteries(serials: string[], batteries: LinkableBattery[]): string[] {
  const wanted = new Set(serials.map(norm).filter((s) => s.length >= 4));
  return batteries.filter((b) => !b.retired && wanted.has(norm(b.serialNumber))).map((b) => b.id);
}

/** A flight already in the logbook: same aircraft taking off within 90 seconds. */
export function isLikelyDuplicate(takeoffAt: string, aircraftId: string, existing: { aircraftId: string; takeoffAt: string }[]): boolean {
  const t = Date.parse(takeoffAt);
  return existing.some((f) => f.aircraftId === aircraftId && Math.abs(Date.parse(f.takeoffAt) - t) < 90_000);
}
