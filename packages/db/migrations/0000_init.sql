CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"pilot_id" uuid NOT NULL,
	"credential_type" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"identifier" text,
	"issued_on" date,
	"expires_on" date,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone,
	"auditor_scope" jsonb
);
--> statement-breakpoint
CREATE TABLE "org_rule_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan_tier" text DEFAULT 'solo' NOT NULL,
	"default_jurisdiction" text DEFAULT 'US-FAA-Part107' NOT NULL,
	"timezone" text NOT NULL,
	"units" jsonb NOT NULL,
	"alert_policy" jsonb DEFAULT '{"amberWithinDays":30,"alertThresholdsDays":[90,30,7]}'::jsonb NOT NULL,
	"branding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pilots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"membership_id" uuid,
	"display_name" text NOT NULL,
	"email" text,
	"phone" text,
	"certificate_number" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jurisdiction" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"authority" text NOT NULL,
	"effective_from" date NOT NULL,
	"disclaimer" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"pilot_id" uuid NOT NULL,
	"course" text NOT NULL,
	"provider" text,
	"completed_on" date NOT NULL,
	"hours" numeric(8, 2)
);
--> statement-breakpoint
CREATE TABLE "aircraft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"nickname" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"serial_number" text NOT NULL,
	"registration_number" text,
	"registration_expires_on" date,
	"remote_id_method" text DEFAULT 'standard' NOT NULL,
	"remote_id_serial" text,
	"takeoff_mass_kg" numeric(10, 4),
	"firmware_version" text,
	"status" text DEFAULT 'active' NOT NULL,
	"grounded_reason" text,
	"total_flight_seconds" bigint DEFAULT 0 NOT NULL,
	"total_flights" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aircraft_firmware_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"firmware_version" text NOT NULL,
	"installed_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "batteries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"serial_number" text NOT NULL,
	"label" text,
	"chemistry" text DEFAULT 'lipo' NOT NULL,
	"cell_count" integer,
	"rated_capacity_mah" integer,
	"cycle_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"aircraft_model" text,
	"purchased_on" date,
	"thresholds" jsonb DEFAULT '{"maxCycles":null,"minCapacityPct":null,"maxCellDeviationMv":null,"maxAgeDays":null}'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "battery_readings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"battery_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"capacity_pct" numeric(5, 2),
	"internal_resistance_mohm" numeric(8, 2),
	"cell_deviation_mv" numeric(8, 2),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "component_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"component_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"installed_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"serial_number" text,
	"aircraft_id" uuid,
	"flight_seconds" bigint DEFAULT 0 NOT NULL,
	"cycles" integer DEFAULT 0 NOT NULL,
	"limit_flight_seconds" bigint,
	"limit_cycles" integer,
	"installed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"schedule_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"performed_by" text NOT NULL,
	"description" text NOT NULL,
	"parts_replaced" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flight_seconds_at_service" bigint,
	"signed_off_by_user_id" uuid,
	"signed_off_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"every_flight_seconds" bigint,
	"every_flights" integer,
	"every_days" integer,
	"last_done_at" timestamp with time zone,
	"last_done_flight_seconds" bigint,
	"last_done_flights" integer,
	"grounds_when_overdue" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"reference" text NOT NULL,
	"title" text,
	"scope" text,
	"conditions" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"geometry" "geography",
	"pilot_id" uuid
);
--> statement-breakpoint
CREATE TABLE "checklist_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"flight_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"location" geography(Point, 4326),
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signed_by_pilot_id" uuid,
	"signed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sections" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"incident_id" uuid NOT NULL,
	"description" text NOT NULL,
	"owner_user_id" uuid,
	"due_on" date,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flight_batteries" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"flight_id" uuid NOT NULL,
	"battery_id" uuid NOT NULL,
	"start_pct" numeric(5, 2),
	"end_pct" numeric(5, 2),
	CONSTRAINT "flight_batteries_flight_id_battery_id_pk" PRIMARY KEY("flight_id","battery_id")
);
--> statement-breakpoint
CREATE TABLE "flight_observers" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"flight_id" uuid NOT NULL,
	"pilot_id" uuid NOT NULL,
	CONSTRAINT "flight_observers_flight_id_pilot_id_pk" PRIMARY KEY("flight_id","pilot_id")
);
--> statement-breakpoint
CREATE TABLE "flights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"pilot_in_command_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"takeoff_at" timestamp with time zone NOT NULL,
	"landing_at" timestamp with time zone NOT NULL,
	"local_time_zone" text NOT NULL,
	"takeoff_point" geography(Point, 4326),
	"landing_point" geography(Point, 4326),
	"path" geography(LineStringZM, 4326),
	"location_name" text,
	"place" jsonb,
	"duration_seconds" integer NOT NULL,
	"max_altitude_agl_m" numeric(10, 2),
	"max_distance_m" numeric(12, 2),
	"total_distance_m" numeric(12, 2),
	"weather" jsonb,
	"airspace_class" text,
	"authorization_id" uuid,
	"mission_id" uuid,
	"site_id" uuid,
	"operation_type" text DEFAULT 'commercial' NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_parser" text,
	"import_confidence" numeric(4, 3),
	"import_warnings" jsonb,
	"raw_log_document_id" uuid,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"location" geography(Point, 4326),
	"aircraft_id" uuid,
	"pilot_id" uuid,
	"flight_id" uuid,
	"summary" text NOT NULL,
	"narrative" text,
	"facts" jsonb NOT NULL,
	"reportability" jsonb,
	"reported_to_regulator_at" timestamp with time zone,
	"regulator_reference" text
);
--> statement-breakpoint
CREATE TABLE "insurance_covered_aircraft" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	CONSTRAINT "insurance_covered_aircraft_policy_id_aircraft_id_pk" PRIMARY KEY("policy_id","aircraft_id")
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"carrier" text NOT NULL,
	"policy_number" text NOT NULL,
	"coverage_summary" text,
	"liability_limit_cents" bigint,
	"effective_on" date NOT NULL,
	"expires_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_aircraft" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"override_reason" text,
	CONSTRAINT "mission_aircraft_mission_id_aircraft_id_pk" PRIMARY KEY("mission_id","aircraft_id")
);
--> statement-breakpoint
CREATE TABLE "mission_authorizations" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	CONSTRAINT "mission_authorizations_mission_id_authorization_id_pk" PRIMARY KEY("mission_id","authorization_id")
);
--> statement-breakpoint
CREATE TABLE "mission_crew" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"pilot_id" uuid NOT NULL,
	"role" text DEFAULT 'pic' NOT NULL,
	CONSTRAINT "mission_crew_mission_id_pilot_id_pk" PRIMARY KEY("mission_id","pilot_id")
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"site_id" uuid,
	"purpose" text,
	"planned_start" timestamp with time zone,
	"planned_end" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"deliverables" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"location" geography(Point, 4326),
	"boundary" geography(Polygon, 4326),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"item_key" text NOT NULL,
	"due_on" text,
	"threshold_days" integer NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "audit_access" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"membership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"request_id" text,
	"db_role" text NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"operation" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"document_id" uuid,
	"verification_hash" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "import_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"import_id" uuid NOT NULL,
	"document_id" uuid,
	"parser" text,
	"status" text NOT NULL,
	"result" jsonb,
	"duplicate_of_flight_id" uuid
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "ledger_checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"seq" bigint NOT NULL,
	"head_hash" text NOT NULL,
	"signature" text NOT NULL,
	"key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"seq" bigint NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_version" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"version" bigint NOT NULL,
	"operation" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"device_id" text NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"field" text NOT NULL,
	"local_value" jsonb,
	"server_value" jsonb,
	"local_changed_by" uuid,
	"local_changed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid DEFAULT (current_setting('app.org_id', true))::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'generic' NOT NULL,
	"events" jsonb NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilots" ADD CONSTRAINT "pilots_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aircraft_firmware_history" ADD CONSTRAINT "aircraft_firmware_history_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battery_readings" ADD CONSTRAINT "battery_readings_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_installations" ADD CONSTRAINT "component_installations_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_installations" ADD CONSTRAINT "component_installations_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_signed_by_pilot_id_pilots_id_fk" FOREIGN KEY ("signed_by_pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_batteries" ADD CONSTRAINT "flight_batteries_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_batteries" ADD CONSTRAINT "flight_batteries_battery_id_batteries_id_fk" FOREIGN KEY ("battery_id") REFERENCES "public"."batteries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_observers" ADD CONSTRAINT "flight_observers_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_observers" ADD CONSTRAINT "flight_observers_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_pilot_in_command_id_pilots_id_fk" FOREIGN KEY ("pilot_in_command_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_covered_aircraft" ADD CONSTRAINT "insurance_covered_aircraft_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_covered_aircraft" ADD CONSTRAINT "insurance_covered_aircraft_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_aircraft" ADD CONSTRAINT "mission_aircraft_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_aircraft" ADD CONSTRAINT "mission_aircraft_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_authorizations" ADD CONSTRAINT "mission_authorizations_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_authorizations" ADD CONSTRAINT "mission_authorizations_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_crew" ADD CONSTRAINT "mission_crew_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_crew" ADD CONSTRAINT "mission_crew_pilot_id_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "credentials_pilot_idx" ON "credentials" USING btree ("pilot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("org_id","user_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_rule_overrides_uq" ON "org_rule_overrides" USING btree ("org_id","jurisdiction","rule_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "pilots_org_idx" ON "pilots" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pilots_membership_uq" ON "pilots" USING btree ("membership_id") WHERE membership_id is not null and deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rule_packs_jurisdiction_version_uq" ON "rule_packs" USING btree ("jurisdiction","version");--> statement-breakpoint
CREATE UNIQUE INDEX "aircraft_org_serial_uq" ON "aircraft" USING btree ("org_id","make","serial_number") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "batteries_org_serial_uq" ON "batteries" USING btree ("org_id","serial_number") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "components_aircraft_idx" ON "components" USING btree ("aircraft_id");--> statement-breakpoint
CREATE INDEX "flight_batteries_battery_idx" ON "flight_batteries" USING btree ("battery_id");--> statement-breakpoint
CREATE INDEX "flights_org_takeoff_idx" ON "flights" USING btree ("org_id","takeoff_at");--> statement-breakpoint
CREATE INDEX "flights_pilot_idx" ON "flights" USING btree ("pilot_in_command_id","takeoff_at");--> statement-breakpoint
CREATE INDEX "flights_aircraft_idx" ON "flights" USING btree ("aircraft_id","takeoff_at");--> statement-breakpoint
CREATE INDEX "flights_dedupe_idx" ON "flights" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_dedupe_uq" ON "alert_deliveries" USING btree ("org_id","item_key","due_on","threshold_days","channel","recipient");--> statement-breakpoint
CREATE INDEX "audit_access_org_at_idx" ON "audit_access" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_org_at_idx" ON "audit_events" USING btree ("org_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_row_idx" ON "audit_events" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_pk" ON "ledger_entries" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "ledger_entries_entity_idx" ON "ledger_entries" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sync_changes_org_id_idx" ON "sync_changes" USING btree ("org_id","id");