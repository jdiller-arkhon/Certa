import type { LengthUnit, MassUnit, SpeedUnit, TemperatureUnit, UnitsPreference } from '../domain/enums.js';

/** Everything is stored in SI. These helpers convert for display only. */
export const M_PER_FT = 0.3048;
export const M_PER_STATUTE_MILE = 1609.344;
export const MPS_PER_KT = 1852 / 3600;
export const MPS_PER_MPH = M_PER_STATUTE_MILE / 3600;
export const MPS_PER_KPH = 1000 / 3600;
export const KG_PER_LB = 0.45359237;

export const DEFAULT_UNITS_US: UnitsPreference = {
  length: 'ft',
  speed: 'mph',
  mass: 'lb',
  temperature: 'F',
};
export const DEFAULT_UNITS_METRIC: UnitsPreference = {
  length: 'm',
  speed: 'kph',
  mass: 'kg',
  temperature: 'C',
};

export function metresTo(m: number, unit: LengthUnit): number {
  return unit === 'ft' ? m / M_PER_FT : m;
}
export function mpsTo(mps: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'mph':
      return mps / MPS_PER_MPH;
    case 'kph':
      return mps / MPS_PER_KPH;
    case 'kt':
      return mps / MPS_PER_KT;
    case 'mps':
      return mps;
  }
}
export function kgTo(kg: number, unit: MassUnit): number {
  if (unit === 'lb') return kg / KG_PER_LB;
  if (unit === 'g') return kg * 1000;
  return kg;
}
export function celsiusTo(c: number, unit: TemperatureUnit): number {
  return unit === 'F' ? (c * 9) / 5 + 32 : c;
}

export function toMetres(value: number, unit: LengthUnit | 'mi'): number {
  if (unit === 'ft') return value * M_PER_FT;
  if (unit === 'mi') return value * M_PER_STATUTE_MILE;
  return value;
}
export function toMps(value: number, unit: SpeedUnit): number {
  return value / mpsTo(1, unit);
}
export function toKg(value: number, unit: MassUnit): number {
  return value / kgTo(1, unit);
}

/** Display-ready quantity handed to presentational components. */
export interface Quantity {
  /** Converted numeric value in the display unit. */
  value: number;
  unit: string;
  /** e.g. "400 ft". */
  display: string;
}

function q(value: number, unit: string, decimals: number): Quantity {
  const rounded = Number(value.toFixed(decimals));
  return {
    value: rounded,
    unit,
    display: `${rounded.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${unit}`,
  };
}

export function formatLength(m: number, prefs: UnitsPreference, decimals = 0): Quantity {
  return q(metresTo(m, prefs.length), prefs.length, decimals);
}
export function formatSpeed(mps: number, prefs: UnitsPreference, decimals = 0): Quantity {
  const unit = prefs.speed === 'mps' ? 'm/s' : prefs.speed === 'kph' ? 'km/h' : prefs.speed;
  return q(mpsTo(mps, prefs.speed), unit, decimals);
}
export function formatMass(kg: number, prefs: UnitsPreference, decimals = 2): Quantity {
  return q(kgTo(kg, prefs.mass), prefs.mass, decimals);
}
export function formatTemperature(c: number, prefs: UnitsPreference): Quantity {
  return q(celsiusTo(c, prefs.temperature), `°${prefs.temperature}`, 0);
}
export function formatDuration(seconds: number): Quantity {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const display = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
  return { value: seconds, unit: 's', display };
}
