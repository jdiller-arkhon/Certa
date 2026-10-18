-- Prior experience: flights, missions and flight time a pilot logged before Certa, in other apps
-- (DJI Fly, AirData, DroneLogbook…), entered as totals per source. They count toward the pilot's
-- all-time totals but not toward date windows (last 30/90/365 days), since they carry no dates.
-- Tenant table with the same row-level security and auditing as every other org table.

CREATE TABLE "prior_experience" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
  "updated_by" uuid,
  "deleted_at" timestamp with time zone,
  "version" bigint DEFAULT 1 NOT NULL,
  "pilot_id" uuid NOT NULL REFERENCES "pilots"("id"),
  "source" text NOT NULL,
  "flights" integer DEFAULT 0 NOT NULL CHECK ("flights" >= 0),
  "missions" integer DEFAULT 0 NOT NULL CHECK ("missions" >= 0),
  "flight_seconds" bigint DEFAULT 0 NOT NULL CHECK ("flight_seconds" >= 0),
  "as_of" date NOT NULL,
  "notes" text
);
--> statement-breakpoint
CREATE INDEX "prior_experience_pilot_idx" ON "prior_experience" ("pilot_id") WHERE deleted_at IS NULL;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE public.prior_experience ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.prior_experience FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON public.prior_experience
    USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id());
  CREATE TRIGGER touch BEFORE UPDATE ON public.prior_experience FOR EACH ROW EXECUTE FUNCTION certa.touch_row();
  CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.prior_experience FOR EACH ROW EXECUTE FUNCTION certa.audit_change();
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.prior_experience TO certa_app;
END
$$;
--> statement-breakpoint

-- The all-time community leaderboard (no date window) now includes prior experience, and pilots
-- with prior experience but no Certa flights yet. Month boards still count Certa flights only.
CREATE OR REPLACE FUNCTION certa.discord_leaderboard(p_from timestamptz, p_to timestamptz, p_limit int)
  RETURNS TABLE (link_id uuid, display_name text, total_seconds bigint, flight_count bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH board AS (
    SELECT l.id, p.display_name,
           COALESCE((SELECT SUM(f.duration_seconds) FROM public.flights f
                      WHERE f.pilot_in_command_id = l.pilot_id AND f.org_id = l.org_id AND f.deleted_at IS NULL
                        AND (p_from IS NULL OR f.takeoff_at >= p_from) AND (p_to IS NULL OR f.takeoff_at < p_to)), 0)
           + CASE WHEN p_from IS NULL AND p_to IS NULL THEN
               COALESCE((SELECT SUM(x.flight_seconds) FROM public.prior_experience x
                          WHERE x.pilot_id = l.pilot_id AND x.org_id = l.org_id AND x.deleted_at IS NULL), 0)
             ELSE 0 END AS secs,
           (SELECT COUNT(*) FROM public.flights f
             WHERE f.pilot_in_command_id = l.pilot_id AND f.org_id = l.org_id AND f.deleted_at IS NULL
               AND (p_from IS NULL OR f.takeoff_at >= p_from) AND (p_to IS NULL OR f.takeoff_at < p_to))
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
