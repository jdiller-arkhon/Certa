-- Keep bearer-ish values out of the audit trail, which admins, chief pilots, and auditors can
-- read: share-link token hashes, and Web Push subscription endpoints and keys. Same function as
-- 0001 with a longer redaction list. (Rows written before this migration are left as-is: the
-- audit log is append-only.)
CREATE OR REPLACE FUNCTION certa.audit_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  before_row jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  after_row  jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  ref        jsonb := coalesce(after_row, before_row);
  redact     text[] := ARRAY['secret', 'secret_hash', 'token_hash', 'p256dh', 'auth', 'endpoint'];
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
