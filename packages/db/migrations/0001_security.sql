-- Tenant isolation (RLS), audit triggers, append-only guards, and the application role.
-- Hand-written: Drizzle cannot express policies or triggers.

CREATE SCHEMA IF NOT EXISTS certa;
--> statement-breakpoint

-- ---------------------------------------------------------------- application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'certa_app') THEN
    CREATE ROLE certa_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- session context helpers
CREATE OR REPLACE FUNCTION certa.app_org_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION certa.app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Orgs the current user belongs to. SECURITY DEFINER so it can read memberships without
-- recursing through the memberships policy.
CREATE OR REPLACE FUNCTION certa.app_user_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT org_id FROM public.memberships
    WHERE user_id = certa.app_user_id()
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- row maintenance
-- Bumps version/updated_at, records updated_by, and forbids changing identity columns.
CREATE OR REPLACE FUNCTION certa.touch_row() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'org_id is immutable'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'created_by is immutable'; END IF;
  NEW.updated_at := now();
  NEW.updated_by := certa.app_user_id();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Organizations have no org_id column; the id is the tenant.
CREATE OR REPLACE FUNCTION certa.touch_org() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  NEW.updated_at := now();
  NEW.updated_by := certa.app_user_id();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- audit
-- Every insert/update/delete on audited tables is recorded with before/after images.
-- SECURITY DEFINER: the app role cannot write audit rows itself.
CREATE OR REPLACE FUNCTION certa.audit_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  before_row jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  after_row  jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  ref        jsonb := coalesce(after_row, before_row);
  redact     text[] := ARRAY['secret', 'secret_hash'];
  org        uuid;
  rid        text;
BEGIN
  IF TG_OP = 'UPDATE' AND before_row = after_row THEN RETURN NULL; END IF;
  before_row := before_row - redact;
  after_row  := after_row - redact;
  org := CASE WHEN TG_TABLE_NAME = 'organizations' THEN (ref->>'id')::uuid ELSE (ref->>'org_id')::uuid END;
  rid := coalesce(ref->>'id', (ref - 'org_id')::text);
  INSERT INTO public.audit_events (org_id, actor_user_id, request_id, db_role, table_name, row_id, operation, before, after)
  VALUES (
    org,
    certa.app_user_id(),
    nullif(current_setting('app.request_id', true), ''),
    session_user,
    TG_TABLE_NAME,
    rid,
    TG_OP,
    before_row,
    after_row
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION certa.forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- apply to tables
DO $$
DECLARE
  t text;
  append_only text[] := ARRAY['audit_events', 'audit_access', 'ledger_entries', 'ledger_checkpoints'];
  -- Tables whose changes are not themselves audited (they are logs, feeds, or dedupe ledgers).
  not_audited text[] := ARRAY['audit_events', 'audit_access', 'ledger_entries', 'ledger_checkpoints',
                              'sync_changes', 'alert_deliveries'];
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    IF t = 'memberships' THEN
      -- Users can see their own memberships in every org (for the org switcher).
      EXECUTE 'CREATE POLICY tenant_isolation ON public.memberships
               USING (org_id = certa.app_org_id() OR user_id = certa.app_user_id())
               WITH CHECK (org_id = certa.app_org_id())';
    ELSIF t = 'audit_events' THEN
      EXECUTE 'CREATE POLICY tenant_read ON public.audit_events FOR SELECT
               USING (org_id = certa.app_org_id())';
      -- Inserts come only from certa.audit_change() (SECURITY DEFINER); the app has no INSERT grant.
      EXECUTE 'CREATE POLICY audit_insert ON public.audit_events FOR INSERT WITH CHECK (true)';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
         USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id())', t);
    END IF;

    IF t = ANY(append_only) THEN
      EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION certa.forbid_mutation()', t);
      EXECUTE format('CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON public.%I
                      FOR EACH STATEMENT EXECUTE FUNCTION certa.forbid_mutation()', t);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'version')
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at') THEN
      EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION certa.touch_row()', t);
    END IF;

    IF NOT (t = ANY(not_audited)) THEN
      EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION certa.audit_change()', t);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

-- Organizations: the id is the tenant boundary.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.organizations
  USING (id = certa.app_org_id() OR id IN (SELECT certa.app_user_org_ids()))
  WITH CHECK (id = certa.app_org_id());
--> statement-breakpoint
CREATE TRIGGER touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION certa.touch_org();
--> statement-breakpoint
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION certa.audit_change();
--> statement-breakpoint

-- Identity changes are audited too (without an org).
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.auth_users
  FOR EACH ROW EXECUTE FUNCTION certa.audit_change();
--> statement-breakpoint

-- ---------------------------------------------------------------- grants
GRANT USAGE ON SCHEMA public, certa TO certa_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA certa TO certa_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO certa_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO certa_app;
--> statement-breakpoint
-- Logs: read-only (audit) or insert-only (access log, ledger) for the app.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM certa_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_access, public.ledger_entries, public.ledger_checkpoints FROM certa_app;
--> statement-breakpoint
-- Rule packs are loaded by the migrator; the app only reads them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rule_packs FROM certa_app;
--> statement-breakpoint
-- PostGIS metadata.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM certa_app;
