import { isDataFlash, isULog, parseArduPilotBin, parseULog } from './binary.js';
import type { Telemetry } from './model.js';
import { LogReadError, parseFlightCsv, parseGpx, parseKml } from './text.js';

export * from './model.js';
export * from './summarize.js';
export * from './view.js';
export * from './link.js';
export { LogReadError, parseCsv, parseFlightCsv, parseGpx, parseKml } from './text.js';
export { isDataFlash, isULog, parseArduPilotBin, parseULog } from './binary.js';

/** Formats Certa reads, for the file picker and the help text. */
export const LOG_FORMATS = [
  { ext: '.csv', label: 'CSV flight record (AirData export for DJI, Autel, Skydio, Parrot; Litchi; generic)' },
  { ext: '.gpx', label: 'GPX track' },
  { ext: '.kml', label: 'KML timed track' },
  { ext: '.bin', label: 'ArduPilot DataFlash log' },
  { ext: '.ulg', label: 'PX4 ULog' },
] as const;

/** DJI's own flight records (.txt) are encrypted from version 13 and need DJI's key service. */
const isDjiTxt = (name: string, b: Uint8Array) => {
  if (!/\.txt$/i.test(name)) return false;
  // Named like DJI's records, or binary content in a .txt file.
  return /DJIFlightRecord|^FlightRecord/i.test(name) || b.subarray(0, 64).some((c) => c < 9);
};

/** Reads any supported log by its content (and name as a hint). */
export function parseFlightLog(name: string, bytes: Uint8Array): Telemetry {
  if (isULog(bytes)) return parseULog(bytes);
  if (isDataFlash(bytes)) return parseArduPilotBin(bytes);
  if (isDjiTxt(name, bytes))
    throw new LogReadError('DJI flight records (.txt) are encrypted. Until DJI log reading is switched on, upload the log to AirData and import its CSV export here.');
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 2048)).replace(/^﻿/, '').trimStart();
  const text = () => new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/^<\?xml|^<gpx|^<kml/i.test(head)) {
    if (/<gpx\b/i.test(head) || /\.gpx$/i.test(name)) return parseGpx(text());
    if (/<kml\b/i.test(head) || /\.kml$/i.test(name)) return parseKml(text());
  }
  if (/,/.test(head.split(/\r?\n/)[0] ?? '')) return parseFlightCsv(text());
  throw new LogReadError('Certa can’t read this file. Supported: CSV flight records, GPX, KML, ArduPilot .bin and PX4 .ulg logs.');
}
