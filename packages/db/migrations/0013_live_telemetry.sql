-- Live telemetry from linked aircraft (DJI Cloud API: DJI Pilot 2 and DJI Dock).
--
-- live_devices   controllers/docks a pilot linked from DJI Pilot 2, and the aircraft seen on
--                them. Gateways hold an MQTT credential (public prefix + hashed secret).
-- live_sessions  one per flight in progress or just finished; becomes a logged flight.
-- live_samples   the frames of a session (about one a second), deleted once logged + 7 days.
--
-- All three are tenant tables under row-level security. The MQTT message server and the bridge
-- work across organizations only through the two SECURITY DEFINER lookups below, which return
-- the minimum (which org a serial number or credential belongs to). Device links are audited;
-- the per-second session state and samples are not (that would flood the audit log).

CREATE TABLE "live_devices" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
  "updated_by" uuid,
  "deleted_at" timestamp with time zone,
  "version" bigint DEFAULT 1 NOT NULL,
  "sn" text NOT NULL CHECK ("sn" ~ '^[A-Za-z0-9]{6,40}$'),
  "kind" text NOT NULL CHECK ("kind" IN ('gateway', 'aircraft')),
  "model" text,
  "gateway_sn" text,
  "pilot_id" uuid REFERENCES "pilots"("id"),
  "mqtt_prefix" text UNIQUE,
  "secret_hash" text,
  "last_seen_at" timestamp with time zone,
  CHECK (("kind" = 'gateway') = ("mqtt_prefix" IS NOT NULL AND "secret_hash" IS NOT NULL))
);
--> statement-breakpoint
-- A controller or aircraft streams to one organization at a time.
CREATE UNIQUE INDEX "live_devices_sn_uq" ON "live_devices" ("sn") WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX "live_devices_org_idx" ON "live_devices" ("org_id") WHERE deleted_at IS NULL;
--> statement-breakpoint

CREATE TABLE "live_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "aircraft_sn" text NOT NULL,
  "gateway_sn" text,
  "model" text,
  "aircraft_id" uuid REFERENCES "aircraft"("id"),
  "pilot_id" uuid REFERENCES "pilots"("id"),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'logged', 'needs_aircraft', 'discarded')),
  "started_at" timestamp with time zone NOT NULL,
  "last_frame_at" timestamp with time zone NOT NULL,
  "last_airborne_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "timed_out" boolean NOT NULL DEFAULT false,
  "last_frame" jsonb,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "flight_id" uuid REFERENCES "flights"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_open_uq" ON "live_sessions" ("aircraft_sn") WHERE status = 'open';
--> statement-breakpoint
CREATE INDEX "live_sessions_org_idx" ON "live_sessions" ("org_id", "started_at" DESC);
--> statement-breakpoint

CREATE TABLE "live_samples" (
  "session_id" uuid NOT NULL REFERENCES "live_sessions"("id") ON DELETE CASCADE,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "t" timestamp with time zone NOT NULL,
  "frame" jsonb NOT NULL,
  PRIMARY KEY ("session_id", "t")
);
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['live_devices', 'live_sessions', 'live_samples'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO certa_app', t);
  END LOOP;
  CREATE TRIGGER touch BEFORE UPDATE ON public.live_devices FOR EACH ROW EXECUTE FUNCTION certa.touch_row();
  CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.live_devices FOR EACH ROW EXECUTE FUNCTION certa.audit_change();
END
$$;
--> statement-breakpoint

-- Which organization a serial number streams to (the bridge routes each message with this).
CREATE OR REPLACE FUNCTION certa.live_device_org(p_sn text)
  RETURNS TABLE (org_id uuid, kind text, gateway_sn text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.org_id, d.kind, d.gateway_sn FROM public.live_devices d WHERE d.sn = p_sn AND d.deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.live_device_org(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.live_device_org(text) TO certa_app;
--> statement-breakpoint

-- A gateway's MQTT credential by its public prefix. The caller compares the secret hash itself,
-- in constant time, before trusting it.
CREATE OR REPLACE FUNCTION certa.live_gateway_credential(p_prefix text)
  RETURNS TABLE (org_id uuid, sn text, secret_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.org_id, d.sn, d.secret_hash FROM public.live_devices d
   WHERE d.mqtt_prefix = p_prefix AND d.kind = 'gateway' AND d.deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.live_gateway_credential(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.live_gateway_credential(text) TO certa_app;
--> statement-breakpoint

-- Open sessions across organizations, for the sweep that closes ones whose aircraft went quiet.
CREATE OR REPLACE FUNCTION certa.live_stale_sessions(p_before timestamptz)
  RETURNS TABLE (id uuid, org_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.org_id FROM public.live_sessions s WHERE s.status = 'open' AND s.last_frame_at < p_before
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.live_stale_sessions(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.live_stale_sessions(timestamptz) TO certa_app;
