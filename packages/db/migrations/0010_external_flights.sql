-- Flights flown on Argus missions (Arkhon jobs), sent by Argus when the pilot marks the job
-- landed. They count toward the pilot's flight time, missions and windows right away; they
-- carry no aircraft until the pilot picks one, which turns the entry into a regular Certa
-- flight (converted_flight_id) so it also counts toward that aircraft's hours.
-- Tenant table with the same row-level security and auditing as every other org table.

CREATE TABLE "external_flights" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
  "updated_by" uuid,
  "deleted_at" timestamp with time zone,
  "version" bigint DEFAULT 1 NOT NULL,
  "pilot_id" uuid NOT NULL REFERENCES "pilots"("id"),
  "source" text NOT NULL CHECK ("source" IN ('argus')),
  "external_id" text NOT NULL,
  "reference" text,
  "takeoff_at" timestamp with time zone NOT NULL,
  "landing_at" timestamp with time zone NOT NULL,
  "duration_seconds" integer NOT NULL CHECK ("duration_seconds" >= 0),
  "location_name" text,
  "takeoff_point" geography(Point, 4326),
  "converted_flight_id" uuid REFERENCES "flights"("id"),
  CHECK ("landing_at" >= "takeoff_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "external_flights_source_uq" ON "external_flights" ("org_id", "source", "external_id");
--> statement-breakpoint
CREATE INDEX "external_flights_pilot_idx" ON "external_flights" ("pilot_id", "takeoff_at") WHERE deleted_at IS NULL AND converted_flight_id IS NULL;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE public.external_flights ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.external_flights FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON public.external_flights
    USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id());
  CREATE TRIGGER touch BEFORE UPDATE ON public.external_flights FOR EACH ROW EXECUTE FUNCTION certa.touch_row();
  CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.external_flights FOR EACH ROW EXECUTE FUNCTION certa.audit_change();
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_flights TO certa_app;
END
$$;
--> statement-breakpoint

-- The community leaderboard counts Argus mission flights not yet turned into Certa flights
-- (converted ones are counted as flights already), in date windows too: they have dates.
CREATE OR REPLACE FUNCTION certa.discord_leaderboard(p_from timestamptz, p_to timestamptz, p_limit int)
  RETURNS TABLE (link_id uuid, display_name text, total_seconds bigint, flight_count bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH board AS (
    SELECT l.id, p.display_name,
           COALESCE((SELECT SUM(f.duration_seconds) FROM public.flights f
                      WHERE f.pilot_in_command_id = l.pilot_id AND f.org_id = l.org_id AND f.deleted_at IS NULL
                        AND (p_from IS NULL OR f.takeoff_at >= p_from) AND (p_to IS NULL OR f.takeoff_at < p_to)), 0)
           + COALESCE((SELECT SUM(e.duration_seconds) FROM public.external_flights e
                      WHERE e.pilot_id = l.pilot_id AND e.org_id = l.org_id AND e.deleted_at IS NULL AND e.converted_flight_id IS NULL
                        AND (p_from IS NULL OR e.takeoff_at >= p_from) AND (p_to IS NULL OR e.takeoff_at < p_to)), 0)
           + CASE WHEN p_from IS NULL AND p_to IS NULL THEN
               COALESCE((SELECT SUM(x.flight_seconds) FROM public.prior_experience x
                          WHERE x.pilot_id = l.pilot_id AND x.org_id = l.org_id AND x.deleted_at IS NULL), 0)
             ELSE 0 END AS secs,
           (SELECT COUNT(*) FROM public.flights f
             WHERE f.pilot_in_command_id = l.pilot_id AND f.org_id = l.org_id AND f.deleted_at IS NULL
               AND (p_from IS NULL OR f.takeoff_at >= p_from) AND (p_to IS NULL OR f.takeoff_at < p_to))
           + (SELECT COUNT(*) FROM public.external_flights e
             WHERE e.pilot_id = l.pilot_id AND e.org_id = l.org_id AND e.deleted_at IS NULL AND e.converted_flight_id IS NULL
               AND (p_from IS NULL OR e.takeoff_at >= p_from) AND (p_to IS NULL OR e.takeoff_at < p_to))
           + CASE WHEN p_from IS NULL AND p_to IS NULL THEN
               COALESCE((SELECT SUM(x.flights) FROM public.prior_experience x
                          WHERE x.pilot_id = l.pilot_id AND x.org_id = l.org_id AND x.deleted_at IS NULL), 0)
             ELSE 0 END AS n
      FROM public.discord_links l
      JOIN public.pilots p ON p.id = l.pilot_id AND p.org_id = l.org_id AND p.deleted_at IS NULL AND p.active
      JOIN public.organizations o ON o.id = l.org_id AND o.discord_leaderboard
     WHERE l.revoked_at IS NULL AND l.leaderboard_opt_in
  )
  SELECT id, display_name, secs::bigint, n::bigint FROM board
   WHERE n > 0
   ORDER BY 3 DESC, 4 DESC, id
   LIMIT LEAST(GREATEST(p_limit, 1), 50)
$$;
