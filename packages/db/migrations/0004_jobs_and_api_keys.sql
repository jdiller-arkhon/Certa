-- Background jobs and machine access need two narrow cross-tenant lookups. Both are
-- SECURITY DEFINER and return the minimum: the worker learns which orgs exist (ids only),
-- and API-key auth learns the one key matching a public prefix. Everything else still runs
-- under the owning org's normal row-level security.

-- Org ids for the daily expiry-alert job. Ids only; the job then reads each org under RLS.
CREATE OR REPLACE FUNCTION certa.alert_org_ids()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.organizations ORDER BY id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.alert_org_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.alert_org_ids() TO certa_app;
--> statement-breakpoint

-- API key by its public prefix (the part before the secret). The caller verifies the secret
-- hash itself, in constant time, before trusting the org id.
CREATE OR REPLACE FUNCTION certa.resolve_api_key(p_prefix text)
  RETURNS TABLE (id uuid, org_id uuid, secret_hash text, scopes jsonb, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT k.id, k.org_id, k.secret_hash, k.scopes, k.expires_at
    FROM public.api_keys k
   WHERE k.prefix = p_prefix AND k.deleted_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.resolve_api_key(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.resolve_api_key(text) TO certa_app;
