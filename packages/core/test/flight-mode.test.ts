import { describe, expect, it } from 'vitest';
import {
  addMarker,
  clock,
  conditionChanges,
  coordinateText,
  currentSortie,
  daylightLeft,
  discardSortie,
  land,
  landBy,
  landedSorties,
  nextBatteries,
  phase,
  setLandingCharge,
  sortieFlight,
  startSession,
  takeOff,
  totalAirSeconds,
  typicalSortieSeconds,
  type Advisory,
  type FlightSession,
} from '../src/index.js';

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const B1 = id(11), B2 = id(12), B3 = id(13);
const t = (min: number) => new Date(Date.UTC(2026, 9, 23, 16, 0) + min * 60_000);

function session() {
  return startSession({
    id: id(1), orgId: id(2), pilotId: id(3), aircraftId: id(4), batteryIds: [B1, B2, B3],
    locationName: 'Henderson Solar Farm', missionId: null, operationType: 'commercial', localTimeZone: 'America/Denver', now: t(0),
  });
}

describe('flight mode', () => {
  it('logs each takeoff to landing as its own sortie', () => {
    let s = session();
    expect(phase(s)).toBe('ground');
    s = takeOff(s, [B1], t(2), id(20));
    expect(phase(s)).toBe('airborne');
    expect(takeOff(s, [B2], t(3), id(99))).toBe(s); // a double tap doesn't start a second sortie
    s = addMarker(s, 'manned_aircraft', t(9), id(30));
    s = land(s, t(20));
    s = setLandingCharge(s, 31.6);
    s = addMarker(s, 'other', t(21), id(31));
    s = takeOff(s, [B2], t(24), id(21));
    expect(currentSortie(s)?.batteryIds).toEqual([B2]);
    expect(totalAirSeconds(s, t(30))).toBe(18 * 60 + 6 * 60);
    expect(landedSorties(s)).toHaveLength(1);
    expect(s.sorties[0]).toMatchObject({ endPct: 32 });
    expect(s.markers.map((m) => m.sortieId)).toEqual([id(20), null]);
  });

  it('turns a landed sortie into a flight with its markers in the notes', () => {
    let s: FlightSession = { ...session(), point: { lat: 39.65, lon: -104.85 } };
    s = takeOff(s, [B1], t(2), id(20));
    s = addMarker(s, 'wildlife', t(9), id(30));
    s = land(s, t(20));
    s = setLandingCharge(s, 28);
    s = takeOff(s, [B2], t(24), id(21));
    const body = sortieFlight(s, landedSorties(s)[0]!, { id: id(40), notes: ' Hawk circled the array. ' });
    expect(body).toMatchObject({
      id: id(40), pilotInCommandId: id(3), aircraftId: id(4), takeoffAt: t(2).toISOString(), landingAt: t(20).toISOString(),
      batteries: [{ batteryId: B1, startPct: null, endPct: 28 }], takeoffPoint: { lat: 39.65, lon: -104.85 }, locationName: 'Henderson Solar Farm',
    });
    expect(body.notes).toBe('Sortie 1 of 2, logged with flight mode.\n10:09 Birds or wildlife\nHawk circled the array.');
    expect(body).not.toHaveProperty('missionId');
  });

  it('picks the next battery that has rested longest and can drop a mistaken sortie', () => {
    let s = takeOff(session(), [B1], t(1), id(20));
    s = land(s, t(15));
    expect(nextBatteries(s)).toEqual([B2]);
    s = takeOff(s, [B2], t(16), id(21));
    s = land(s, t(30));
    expect(nextBatteries(s, 2)).toEqual([B3, B1]);
    s = addMarker(takeOff(s, [B3], t(31), id(22)), 'signal_loss', t(31), id(32));
    s = discardSortie(s, id(22));
    expect(phase(s)).toBe('ground');
    expect(s.markers[0]!.sortieId).toBeNull();
  });

  it('never gives a sortie negative time', () => {
    const s = land(takeOff(session(), [B1], t(10), id(20)), t(5));
    expect(s.sorties[0]!.landingAt).toBe(t(10).toISOString());
  });

  it('counts down to the typical landing time from history', () => {
    expect(typicalSortieSeconds([1200, 30, 1500])).toBeNull(); // the 30 s hop doesn't count
    expect(typicalSortieSeconds([1200, 1500, 900, 1320])).toBe(1260);
    const sortie = { id: id(20), batteryIds: [B1], takeoffAt: t(0).toISOString(), landingAt: null, endPct: null };
    expect(landBy(sortie, 1200, t(10))).toMatchObject({ remaining: 600, level: 'green', fraction: .5 });
    expect(landBy(sortie, 1200, t(17.5)).level).toBe('amber');
    expect(landBy(sortie, 1200, t(21))).toMatchObject({ remaining: -60, level: 'red', fraction: 1 });
  });

  it('only flags conditions that got worse', () => {
    const a = (key: string, level: Advisory['level'], source = 'NWS'): Advisory => ({ key, level, title: key, detail: '', source });
    const prev = [a('wind', 'amber'), a('kp', 'amber'), a('remind', 'amber', 'Reminder')];
    const next = [a('wind', 'red'), a('kp', 'green'), a('tfr', 'red'), a('remind', 'amber', 'Reminder'), a('night', 'amber')];
    expect(conditionChanges(prev, next).map((x) => x.key)).toEqual(['wind', 'tfr', 'night']);
    expect(conditionChanges(next, next)).toEqual([]);
  });

  it('formats clocks, daylight and coordinates for the field', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3729)).toBe('1:02:09');
    expect(clock(-42)).toBe('−0:42');
    expect(daylightLeft(t(90).toISOString(), t(0))).toBe(5400);
    expect(daylightLeft(t(-1).toISOString(), t(0))).toBeNull();
    expect(coordinateText({ lat: 39.65012, lon: -104.84987 })).toEqual({ decimal: '39.65012, -104.84987', dms: '39°39′00.4″N 104°50′59.5″W' });
  });
});
