import type { GeoPoint, TrackPoint } from '@certa/core';
import { sql } from '@certa/db';

/** A point as a geography value. */
export const ewkt = (p: GeoPoint | null | undefined) => (p ? sql`ST_GeogFromText(${`SRID=4326;POINT(${p.lon} ${p.lat})`})` : null);

/** A flight track as a geography line: lon/lat, Z = height above takeoff, M = epoch seconds. Points are schema-validated numbers. */
export const lineZM = (pts: TrackPoint[] | null | undefined) =>
  pts && pts.length >= 2 ? sql`ST_GeogFromText(${`SRID=4326;LINESTRING ZM(${pts.map(([x, y, z, m]) => `${x} ${y} ${z} ${m}`).join(',')})`})` : null;
