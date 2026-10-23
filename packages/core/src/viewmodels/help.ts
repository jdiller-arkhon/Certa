/**
 * Plain-language help for people new to drone operations: a glossary of the terms Certa uses,
 * and the getting-started checklist shown on Today until a pilot is set up.
 */
import type { FleetSnapshot } from '../fleet/fleet.js';

export interface GlossaryEntry {
  id: string;
  term: string;
  /** One or two plain sentences. */
  short: string;
}

/** Terms in the order a new pilot meets them. */
export const GLOSSARY: GlossaryEntry[] = [
  { id: 'part107', term: 'Part 107', short: 'The FAA rules for flying a drone for work (14 CFR Part 107). Passing the FAA knowledge test gets you a Remote Pilot Certificate.' },
  { id: 'certificate', term: 'Remote Pilot Certificate', short: 'Your FAA drone license under Part 107. It doesn’t expire, but you have to keep it current with recurrent training.' },
  { id: 'recurrent', term: 'Recurrent training', short: 'The free FAA online course you must complete every 24 calendar months to keep flying under Part 107.' },
  { id: 'pic', term: 'Pilot in command', short: 'The person responsible for the flight. Usually you, the person flying the drone.' },
  { id: 'registration', term: 'Registration', short: 'Every drone flown for work under Part 107 must be registered with the FAA on FAADroneZone, whatever it weighs. It lasts 3 years.' },
  { id: 'remoteid', term: 'Remote ID', short: 'A broadcast that identifies your drone in flight, like a digital license plate. Most drones have it built in; older ones need a module.' },
  { id: 'agl', term: 'AGL', short: 'Above ground level: height measured from the ground below the drone. Part 107 limits you to 400 ft AGL.' },
  { id: 'airspace', term: 'Controlled airspace', short: 'Airspace around airports (Class B, C, D and surface E). You need FAA permission to fly there, usually through LAANC.' },
  { id: 'laanc', term: 'LAANC', short: 'Instant FAA approval to fly in controlled airspace, up to a set height, requested through an FAA-approved app such as Aloft.' },
  { id: 'tfr', term: 'TFR', short: 'Temporary flight restriction: a no-fly area for a set time, for example around a stadium event, a wildfire or a VIP visit.' },
  { id: 'notam', term: 'NOTAM', short: 'Notice to air missions: an FAA alert about things like closed airspace, airshows or new obstacles. Check them before you fly.' },
  { id: 'metar', term: 'METAR / TAF', short: 'Airport weather: a METAR is the current report, a TAF is the forecast. Certa shows the nearest airport’s.' },
  { id: 'ceiling', term: 'Cloud ceiling', short: 'The height of the lowest cloud layer covering most of the sky. You must stay 500 ft below clouds.' },
  { id: 'gonogo', term: 'Go / no-go', short: 'Certa’s check before takeoff: your certificate, training, drone, batteries, weather and airspace. Advisory only; you make the call.' },
  { id: 'waiver', term: 'Waiver', short: 'FAA permission to fly outside a Part 107 rule, for example at night over people or beyond line of sight.' },
  { id: 'gnss', term: 'GNSS', short: 'Satellite positioning (GPS and similar). The drone needs a solid lock before takeoff so it can hold position and return home.' },
  { id: 'imu', term: 'IMU', short: 'The drone’s motion sensors. The app warns if they need calibrating; don’t take off with an IMU or compass warning.' },
  { id: 'kp', term: 'Kp index', short: 'A 0–9 measure of geomagnetic storms. At 5 or above, GPS and the compass can be unreliable.' },
];

const BY_ID = new Map(GLOSSARY.map((g) => [g.id, g]));
export const glossary = (id: string): GlossaryEntry | undefined => BY_ID.get(id);

export interface GettingStartedStep {
  id: 'certificate' | 'recurrent' | 'aircraft' | 'flight';
  title: string;
  body: string;
  done: boolean;
  href: string;
  action: string;
}

export interface GettingStartedViewModel {
  steps: GettingStartedStep[];
  doneCount: number;
  /** Every step done: the checklist can go away. */
  complete: boolean;
}

/**
 * The first things a pilot does in Certa, ticked off from their records. `ownPilotId` is the
 * signed-in person's pilot record (null for members who don't fly, who get no checklist).
 */
export function buildGettingStarted(s: FleetSnapshot, ownPilotId: string | null): GettingStartedViewModel | null {
  if (!ownPilotId) return null;
  const types = s.rulePack.credentialTypes;
  const certTypes = new Set(types.filter((t) => t.requiredForCurrency && !t.validityRuleId).flatMap((t) => [t.id, ...t.satisfiedBy]));
  const recurrentTypes = new Set(types.filter((t) => t.requiredForCurrency && !!t.validityRuleId).flatMap((t) => [t.id, ...t.satisfiedBy]));
  const mine = s.credentials.filter((c) => c.pilotId === ownPilotId && !c.deletedAt);
  const pilotHref = `/pilots/${ownPilotId}#credentials`;
  const steps: GettingStartedStep[] = [
    {
      id: 'certificate',
      title: 'Add your pilot certificate',
      body: 'Your FAA Remote Pilot Certificate (Part 107). The issue date is on the card.',
      done: mine.some((c) => certTypes.has(c.credentialType)),
      href: pilotHref,
      action: 'Add certificate',
    },
    {
      id: 'recurrent',
      title: 'Add your latest training',
      body: 'The date you last passed the FAA knowledge test or online recurrent course. Certa works out when it’s due again.',
      done: mine.some((c) => recurrentTypes.has(c.credentialType)),
      href: pilotHref,
      action: 'Add training',
    },
    {
      id: 'aircraft',
      title: 'Add your drone',
      body: 'Make, model, serial number and its FAA registration number. Takes a minute.',
      done: s.aircraft.some((a) => !a.deletedAt),
      href: '/aircraft/new',
      action: 'Add drone',
    },
    {
      id: 'flight',
      title: 'Log your first flight',
      body: 'Certa runs a quick go / no-go check and saves the flight to your logbook. Works offline in the field.',
      done: !!s.lastFlight || Object.values(s.pilotTotals).some((t) => t.flights > 0),
      href: '/flights/new',
      action: 'Log a flight',
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  return { steps, doneCount, complete: doneCount === steps.length };
}
