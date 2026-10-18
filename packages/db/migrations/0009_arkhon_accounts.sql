-- One account across Arkhon: people sign in to Certa with their Arkhon (Argus) account. The Certa
-- user row keeps the Arkhon user id it belongs to and the Arkhon role last seen at sign-in
-- (client | pilot | admin), which decides what they get in Certa.

ALTER TABLE "auth_users" ADD COLUMN "arkhon_user_id" text;
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "arkhon_role" text;
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "arkhon_admin_level" text;
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "arkhon_synced_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_arkhon_uq" ON "auth_users" ("arkhon_user_id") WHERE arkhon_user_id IS NOT NULL;
