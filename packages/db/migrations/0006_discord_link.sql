-- Discord link for the Certa community bot. A pilot generates a short-lived, single-use code in
-- Certa; the bot redeems it with the Discord user id. The bot then addresses the pilot only by
-- the opaque link id, and only while the link is active. Both tables are tenant tables with the
-- same row-level security and auditing as every other org table.

CREATE TABLE "discord_link_codes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
  "updated_by" uuid,
  "version" bigint DEFAULT 1 NOT NULL,
  "pilot_id" uuid NOT NULL REFERENCES "pilots"("id"),
  -- SHA-256 of the code; the code itself is shown once and never stored. Named token_hash so
  -- the audit trail redacts it.
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discord_link_codes_token_uq" ON "discord_link_codes" ("token_hash");
--> statement-breakpoint

CREATE TABLE "discord_links" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL REFERENCES "organizations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
  "updated_by" uuid,
  "version" bigint DEFAULT 1 NOT NULL,
  "pilot_id" uuid NOT NULL REFERENCES "pilots"("id"),
  "discord_user_id" text NOT NULL,
  -- Off until the pilot turns it on: the leaderboard is visible to the whole community server.
  "leaderboard_opt_in" boolean DEFAULT false NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discord_links_discord_uq" ON "discord_links" ("discord_user_id") WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "discord_links_pilot_uq" ON "discord_links" ("pilot_id") WHERE revoked_at IS NULL;
--> statement-breakpoint

-- An org admin can keep the whole org off the community leaderboard regardless of pilot opt-ins.
ALTER TABLE "organizations" ADD COLUMN "discord_leaderboard" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['discord_link_codes', 'discord_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I
                    USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id())', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION certa.touch_row()', t);
    EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION certa.audit_change()', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO certa_app', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Redeem a code: atomically marks it used, ends any other active link for that Discord user or
-- that pilot, and creates the link. Returns nothing for an unknown, expired, or used code, or a
-- pilot who has since been deactivated.
CREATE OR REPLACE FUNCTION certa.redeem_discord_code(p_token_hash text, p_discord_user_id text, p_link_id uuid)
  RETURNS TABLE (link_id uuid, org_id uuid, pilot_id uuid, display_name text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record;
BEGIN
  UPDATE public.discord_link_codes k SET used_at = now()
   WHERE k.token_hash = p_token_hash AND k.used_at IS NULL AND k.expires_at > now()
   RETURNING k.org_id, k.pilot_id INTO c;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pilots p WHERE p.id = c.pilot_id AND p.org_id = c.org_id AND p.deleted_at IS NULL AND p.active) THEN RETURN; END IF;
  UPDATE public.discord_links l SET revoked_at = now()
   WHERE l.revoked_at IS NULL AND (l.discord_user_id = p_discord_user_id OR l.pilot_id = c.pilot_id);
  INSERT INTO public.discord_links (id, org_id, pilot_id, discord_user_id) VALUES (p_link_id, c.org_id, c.pilot_id, p_discord_user_id);
  RETURN QUERY SELECT p_link_id, c.org_id, c.pilot_id, p.display_name FROM public.pilots p WHERE p.id = c.pilot_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.redeem_discord_code(text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.redeem_discord_code(text, text, uuid) TO certa_app;
--> statement-breakpoint

-- The org and pilot behind an active link, while the pilot is active. The bot API then reads the
-- pilot's records under that org's normal row-level security.
CREATE OR REPLACE FUNCTION certa.resolve_discord_link(p_link_id uuid)
  RETURNS TABLE (org_id uuid, pilot_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.org_id, l.pilot_id
    FROM public.discord_links l
    JOIN public.pilots p ON p.id = l.pilot_id AND p.org_id = l.org_id
   WHERE l.id = p_link_id AND l.revoked_at IS NULL AND p.deleted_at IS NULL AND p.active
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.resolve_discord_link(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.resolve_discord_link(uuid) TO certa_app;
--> statement-breakpoint

-- Community leaderboard across orgs: only pilots who opted in, in orgs that allow it. Returns
-- display names and totals, nothing else.
CREATE OR REPLACE FUNCTION certa.discord_leaderboard(p_from timestamptz, p_to timestamptz, p_limit int)
  RETURNS TABLE (link_id uuid, display_name text, total_seconds bigint, flight_count bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id, p.display_name, COALESCE(SUM(f.duration_seconds), 0)::bigint, COUNT(f.id)::bigint
    FROM public.discord_links l
    JOIN public.pilots p ON p.id = l.pilot_id AND p.org_id = l.org_id AND p.deleted_at IS NULL AND p.active
    JOIN public.organizations o ON o.id = l.org_id AND o.discord_leaderboard
    JOIN public.flights f ON f.pilot_in_command_id = l.pilot_id AND f.org_id = l.org_id AND f.deleted_at IS NULL
         AND (p_from IS NULL OR f.takeoff_at >= p_from) AND (p_to IS NULL OR f.takeoff_at < p_to)
   WHERE l.revoked_at IS NULL AND l.leaderboard_opt_in
   GROUP BY l.id, p.display_name
   ORDER BY 3 DESC, 4 DESC, l.id
   LIMIT LEAST(GREATEST(p_limit, 1), 50)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.discord_leaderboard(timestamptz, timestamptz, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.discord_leaderboard(timestamptz, timestamptz, int) TO certa_app;
