CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'inspector_packet' NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "model_document_id" uuid;--> statement-breakpoint
ALTER TABLE "flights" ADD COLUMN "go_no_go" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("org_id","endpoint") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "share_links_subject_idx" ON "share_links" USING btree ("subject_type","subject_id");--> statement-breakpoint
-- Same tenant protection as every Phase 1 table (see 0001_security.sql).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['share_links', 'push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I
                    USING (org_id = certa.app_org_id()) WITH CHECK (org_id = certa.app_org_id())', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION certa.touch_row()', t);
    EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION certa.audit_change()', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- A share-link recipient has no account or org context. This resolves exactly one live link by
-- its token hash (and counts the view); the API then reads that one subject under the owning
-- org's normal RLS. It can't enumerate links or reveal anything beyond the matched row.
CREATE OR REPLACE FUNCTION certa.resolve_share_link(p_token_hash text)
  RETURNS TABLE (id uuid, org_id uuid, subject_type text, subject_id uuid, label text, expires_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
    UPDATE public.share_links s
       SET view_count = s.view_count + 1, last_viewed_at = now()
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL AND s.deleted_at IS NULL AND s.expires_at > now()
    RETURNING s.id, s.org_id, s.subject_type, s.subject_id, s.label, s.expires_at;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION certa.resolve_share_link(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION certa.resolve_share_link(text) TO certa_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links, public.push_subscriptions TO certa_app;
