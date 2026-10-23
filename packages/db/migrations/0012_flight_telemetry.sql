-- Flight-log import: metrics read from the aircraft's own log (height, distance, speed, battery
-- voltages and cell balance, warnings), kept with the flight. The track itself goes in the
-- existing "path" column. Raw logs are not stored; they are read on the pilot's device.

ALTER TABLE "flights" ADD COLUMN "telemetry" jsonb;
--> statement-breakpoint
COMMENT ON COLUMN "flights"."path" IS 'Track: X/Y = lon/lat, Z = height above takeoff (m), M = epoch seconds.';
