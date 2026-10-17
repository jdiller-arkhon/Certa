-- Mission planning: where and how high a planned operation flies, and what kind of operation it
-- is, so its readiness can be checked and flights logged against it start pre-filled. The
-- missions, mission_crew, mission_aircraft and mission_authorizations tables (and their
-- row-level security and auditing) come from 0000/0001.

ALTER TABLE "missions" ADD COLUMN "location_name" text;
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "location" geography(Point, 4326);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "max_altitude_agl_m" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "operation_type" text DEFAULT 'commercial' NOT NULL;
--> statement-breakpoint
CREATE INDEX "missions_org_start_idx" ON "missions" ("org_id", "planned_start");
--> statement-breakpoint
CREATE INDEX "flights_mission_idx" ON "flights" ("mission_id") WHERE mission_id IS NOT NULL;
