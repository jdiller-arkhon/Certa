-- Arkhon platform console: announcements to everyone on Certa, and a log of what platform
-- admins did (reminders, invites, exports, announcements). Both are platform-wide, not
-- tenant tables: only platform-admin endpoints write them, after a live Arkhon admin check,
-- and pilots read announcements addressed to them through GET /announcements.

CREATE TABLE "platform_announcements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "title" text NOT NULL CHECK (length("title") BETWEEN 1 AND 120),
  "body" text NOT NULL CHECK (length("body") BETWEEN 1 AND 4000),
  "audience" text NOT NULL CHECK ("audience" IN ('everyone', 'pilots', 'managers')),
  "level" text NOT NULL DEFAULT 'info' CHECK ("level" IN ('info', 'important')),
  "emailed" integer NOT NULL DEFAULT 0,
  "pushed" integer NOT NULL DEFAULT 0,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "created_by" uuid REFERENCES "auth_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_announcements_active_idx" ON "platform_announcements" ("starts_at", "ends_at");
--> statement-breakpoint

CREATE TABLE "platform_admin_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_user_id" uuid REFERENCES "auth_users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "org_id" uuid REFERENCES "organizations"("id"),
  "target" text,
  "detail" jsonb,
  "request_id" text
);
--> statement-breakpoint
CREATE INDEX "platform_admin_events_at_idx" ON "platform_admin_events" ("at" DESC);
--> statement-breakpoint

-- Announcements can be ended (ends_at), never deleted; the event log is append-only.
GRANT SELECT, INSERT, UPDATE ON public.platform_announcements TO certa_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.platform_admin_events TO certa_app;
