# Certa — Architecture Plan (v0.1, for approval)

**Status:** Proposal. No code has been scaffolded yet. Approval of this document is the gate before Phase 1 begins.
**Owner:** Claude Code (backend, data, integration). Frontend presentation is owned by ChatGPT via the `contract/` folder.

---

## 0. Summary

Certa is a pnpm + Turborepo TypeScript monorepo with:

- a **Fastify API** as the only writer to PostgreSQL/PostGIS,
- a **Next.js web dashboard** and an **Expo field app**, both thin integration layers around ChatGPT's presentational components,
- a **pure, framework-free `packages/core`** holding domain types, Zod schemas, the rule-pack engine, and expiration/readiness logic, shared by API, web, and mobile (the mobile app runs the same readiness logic offline),
- **tenant isolation by Postgres row-level security**, **audit by database triggers**, and **tamper evidence by a per-organization hash chain** — all enforced in the database rather than trusted to the application,
- a **custom offline-first sync protocol** between device SQLite and the API,
- everything shippable as **one `docker compose up`** with no required internet access.

Three non-negotiables drive most choices below: (1) the self-hosted / air-gapped tier is first-class, so no required SaaS dependency; (2) records must survive an adversarial audit, so integrity is enforced below the app; (3) regulatory values are data, never code.

---

## 1. Folder structure

```
certa/
├─ apps/
│  ├─ api/                 Fastify service: REST API, auth, jobs worker entrypoint
│  │  ├─ src/routes/       one folder per resource; Zod schemas from @certa/core
│  │  ├─ src/plugins/      auth, tenancy (RLS context), audit context, errors, logging
│  │  ├─ src/jobs/         pg-boss handlers: alerts, digests, imports, exports, enrichment
│  │  ├─ src/pdf/          HTML templates + headless Chromium renderer
│  │  └─ test/             integration tests (real Postgres)
│  ├─ web/                 Next.js App Router
│  │  ├─ app/              routes + route-level loaders/containers (Claude)
│  │  ├─ src/containers/   data hooks → view-model mapping → presentational screen (Claude)
│  │  ├─ src/screens/      ChatGPT presentational screens (placeholders until delivered)
│  │  └─ e2e/              Playwright
│  └─ mobile/              Expo / React Native
│     ├─ app/              expo-router routes + containers (Claude)
│     ├─ src/sync/         SQLite schema, outbox, pull/push, conflict queue (Claude)
│     └─ src/screens/      ChatGPT presentational screens (placeholders until delivered)
├─ packages/
│  ├─ core/                domain types, Zod schemas, view-models, rule engine,
│  │                       readiness/expiration engine, units, canonical-JSON hashing
│  ├─ db/                  Drizzle schema, SQL migrations, RLS policies, audit/ledger
│  │                       triggers, seed scripts, rule-pack loader
│  ├─ parsers/             one sub-module per format, each with fixtures + tests
│  ├─ rulepacks/           versioned rule-pack files (US-FAA-Part107/…), schema-validated
│  ├─ sdk/                 typed API client generated from OpenAPI (used by web + mobile)
│  ├─ ui/                  ChatGPT: design tokens + component library
│  └─ config/              shared tsconfig, eslint, vitest presets
├─ contract/               single source of truth handed to ChatGPT (see §9)
├─ infra/
│  ├─ docker/              Dockerfiles, compose.yml, compose.dev.yml, Caddyfile
│  └─ scripts/             backup.sh, restore.sh, upgrade.sh, healthcheck
├─ docs/                   this plan, ADRs, RULES_VERIFICATION.md, self-hosting guide
├─ .env.example
└─ README.md
```

---

## 2. Runtime architecture

```
 Browser ──► Caddy (TLS, single origin) ──► /       Next.js (web)
                                        └─► /api/* Fastify (api)  ──► Postgres 16 + PostGIS
 Expo app ─────────── HTTPS ──────────────► /api/*                ├─► S3 / MinIO (files)
                                                                  └─► SMTP (Mailpit in dev)
 Worker (same image as api, `node dist/worker.js`) ── pg-boss queues in Postgres
 PDF renderer: headless Chromium inside the worker container
```

- **Single origin via Caddy.** Web and API share an origin, so session cookies work without CORS, and self-hosters configure one hostname.
- **Next.js is not a second backend.** Web pages fetch from the Fastify API with TanStack Query through `@certa/sdk`. No business logic in Next server actions; this keeps one authorization path and one audit path. (Next server components may prefetch via the same SDK for first paint.)
- **API and worker share one image** to keep self-hosted installs simple; the worker runs pg-boss consumers and the PDF renderer.

---

## 3. Key technology decisions

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript strict, ESM | Matches environment; one language end to end. |
| API | Fastify + `fastify-type-provider-zod` + `@fastify/swagger` | Zod schemas in `core` become runtime validation **and** the OpenAPI document, so the spec cannot drift from the code. |
| ORM / migrations | Drizzle ORM + drizzle-kit, with hand-written SQL migrations for RLS, triggers, PostGIS | Drizzle for typed queries; raw SQL where Drizzle can't express things (policies, triggers). |
| DB | PostgreSQL 16 + PostGIS 3.4 | Spec says 15+; 16 is current stable on both images and distros. |
| Job queue | **pg-boss** | Postgres-backed, cron schedules, retries, singleton keys for dedupe. No Redis. |
| Auth | **Better Auth** (Drizzle adapter): email+password, magic link, organization plugin, SSO plugin (OIDC + SAML), API-key plugin | Covers every required method in one maintained library with self-hosted storage; avoids rolling our own crypto/session handling. See §11 Q1. |
| Password hashing | Argon2id | Current best practice. |
| File storage | S3 API via `@aws-sdk/client-s3`; MinIO in compose | Same code for AWS S3, MinIO, R2, etc. |
| PDF | HTML/CSS templates rendered by headless Chromium (Playwright) in the worker | High-fidelity, brandable, testable. See reproducibility note in §7. |
| Email | Nodemailer over SMTP; Mailpit in dev | Works air-gapped with any internal relay. |
| Maps | MapLibre GL (web + RN) with a configurable tile URL; PMTiles basemap option for air-gapped | No Mapbox token required; self-hosters can serve tiles locally. |
| Mobile DB | expo-sqlite + Drizzle (SQLite dialect) | Typed local queries; same Zod schemas validate local writes. |
| Testing | Vitest (unit + integration against a real Postgres), Playwright (web e2e), Maestro (mobile e2e flows, Phase 2+) | Integration tests hit real Postgres so RLS and triggers are actually exercised. |
| Logging | pino (structured JSON), request IDs, org/user IDs in log context (never PII payloads) | |
| IDs | UUIDv7, generated client-side | Required for offline creation; time-ordered for index locality. |

---

## 4. Multi-tenancy, roles, and audit — enforced in the database

**Row-level security.** Every tenant table has `org_id` and an RLS policy `org_id = current_setting('app.org_id')::uuid`. The API connects as a role **without** `BYPASSRLS` and, per request, opens a transaction and runs `SET LOCAL app.org_id`, `app.user_id`, `app.request_id`. Migrations run as a separate owner role. An integration test suite asserts cross-tenant reads/writes fail even when the app "forgets" a `WHERE org_id`.

**Roles** (`owner, admin, chief_pilot, pilot, maintenance_tech, viewer, auditor`) are per-membership (a user can belong to several orgs). Authorization is a single permission matrix in `packages/core` (`can(role, action, resource, context)`), used by the API and mirrored in the UI to hide unavailable actions. Pilot-scoped rules ("log *own* flights") are checked in the API and backed by RLS where practical.

**Auditor role** is a membership with `expires_at` and a `scope` (date range, pilots, aircraft). Every read by an auditor writes an `audit_access` row.

**Audit log** is written by a generic `AFTER INSERT/UPDATE/DELETE` trigger on every tenant table, capturing `actor (app.user_id)`, `request_id`, `table`, `row_id`, `op`, `before jsonb`, `after jsonb`, `at`. Because it's a trigger, even direct SQL changes are recorded (with `actor = NULL`, which is itself a red flag the integrity report surfaces). `audit_events` is append-only: `UPDATE`/`DELETE` are revoked and a trigger raises if attempted.

**Common columns** on every entity: `id, org_id, created_at, updated_at, created_by, updated_by, deleted_at` (soft delete), plus sync columns `version bigint` and `hlc text` on synced tables.

---

## 5. Data model (Phase 1 defines all tables; features fill them in by phase)

Grouped summary; full Drizzle schema lands in Phase 1.

**Tenancy & people**
- `organizations` — name, plan_tier, default_jurisdiction, units_pref (length/speed/mass/temp), timezone, branding (logo file, colors), settings jsonb.
- `users` (global identity) · `memberships` (user↔org, role, auditor scope/expiry) · auth tables owned by Better Auth.
- `pilots` — 1:1 with a membership *or* standalone (pilots who don't log in, e.g. contractors); display name, contact, certificate number.
- `credentials` — pilot_id, `credential_type` (keyed to the rule pack: `part107_certificate`, `part107_recurrent`, `night_training`, `type_training`, `waiver_held`, `medical_declaration`, …), issued_on, expires_on (nullable: computed by rule pack when absent), document_ids, rule_pack_version_used.
- `training_records` — pilot_id, course, provider, completed_on, hours.

**Fleet**
- `aircraft` — make, model, serial, registration_number, registration_expires_on, remote_id_method (`standard`, `broadcast_module`, `fria`, `none`), remote_id_serial, weight_class / takeoff_mass_kg, firmware_version, status (`active|grounded|retired`), grounded_reason, totals (cached: flight_seconds, flight_count).
- `aircraft_firmware_history` — aircraft_id, version, installed_at, notes.
- `components` — kind (motor, propeller, gimbal, payload, sensor, other), serial, aircraft_id (nullable), hours, cycles, limits, installed_at, removed_at; `component_installations` history table.
- `batteries` — serial, chemistry, rated_capacity_mah, cell_count, cycle_count, status, retirement thresholds (cycles, capacity %, cell deviation mV, age), `battery_readings` (capacity, IR, cell deviation over time).
- `maintenance_schedules` — target (aircraft | component | battery), triggers: every N flight-seconds, N flights, N days — **whichever first**; last_done snapshot.
- `maintenance_events` — scheduled/unscheduled, schedule_id, parts replaced, performed_by, hours_at_service, signed_off_by/at, notes, documents.

**Operations**
- `flights` — pic_pilot_id, observer ids (join table), aircraft_id, takeoff_at / landing_at (timestamptz, UTC), `local_tz` (IANA, derived from takeoff point), takeoff_point / landing_point (`geography(Point)`), path (`geography(LineStringZM)` — Z altitude, M epoch seconds), duration_s, max_altitude_m (AGL and/or MSL with explicit reference), max_distance_m, airspace_class, authorization_id, mission_id, operation_type, weather jsonb (+ provider, fetched_at), place jsonb (reverse-geocode), notes, `source` (`manual|import:<parser>`), raw_log_file_id, parser confidence + warnings.
- `flight_batteries` — flight_id, battery_id, start/end % and voltage if known.
- `missions` — client_id, site_id, purpose, planned_start/end, status, crew (join), aircraft (join), required authorizations, deliverables.
- `clients`, `sites` (geometry: `geography(Polygon|Point)`, address, default authorization).
- `authorizations` — kind (LAANC, DroneZone airspace authorization, Part 107 waiver, COA, other), reference, scope text, geometry, valid_from/to, conditions, documents.
- `checklist_templates` (versioned; sections → items with `required`, `photo_required`) and `checklist_runs` (template version, flight_id, responses, photos, signed_by, signed_at, geotag).
- `incidents` — type, severity, occurred_at, location, aircraft/pilot/flight links, injury/damage fields used by the rule pack, `reportability` (computed snapshot: reportable?, deadline, rule ids, rule-pack version), status; `corrective_actions`.
- `insurance_policies` — carrier, policy number, coverage, limits, covered aircraft (join), effective/expires.

**Records & platform**
- `documents` — owner (entity type + id), s3 key, mime, size, sha256, uploaded_by.
- `audit_events`, `audit_access` (see §4).
- `ledger_entries` — hash chain (see §7).
- `rule_packs`, `rules`, `org_rule_overrides` (see §6).
- `alert_policies` (per-org windows, channels), `alert_deliveries` (item, threshold, channel, sent_at — dedupe key).
- `imports` / `import_items` (bulk import staging, review state, dedupe result).
- `exports` (requested artifact, status, file, verification hash).
- `api_keys` (hashed, scoped), `webhook_endpoints`, `webhook_deliveries`.
- `sync_changes` (server change feed, see §8), `sync_conflicts`.

All quantities stored in SI (`_m`, `_s`, `_kg`, `_mps`, `_c`); conversion happens only in view-model mapping.

---

## 6. Rule packs (regulatory values are data)

**Format.** Each pack is a versioned file set in `packages/rulepacks/<jurisdiction>/<version>/` (YAML), validated by a Zod schema in `core`, and loaded into `rule_packs` / `rules` by a migration-time seeder. Jurisdiction IDs: `US-FAA-Part107` now; `CA-TC`, `EU-EASA`, `UK-CAA` are new folders, no schema change.

**Each rule** has: `id` (stable, e.g. `pilot.recurrent_training.validity`), `kind` (`duration`, `distance`, `mass`, `deadline`, `boolean`, `enum`, `threshold_set`), `value` + unit, `applies_to`, human description, `source_citation` (title + section + URL), `last_verified_on`, `needs_verification: true`, and `notes`.

**Semantics vs. values.** Values live in the pack; the *meaning* of a rule id lives in versioned evaluator functions in `core` (e.g. `credentialExpiry(credential, pack)`, `incidentReportability(incident, pack)`). I'm deliberately **not** building a general-purpose rule DSL: a DSL is hard to test and audit, while typed evaluators keyed by rule id are unit-testable and still let a new jurisdiction swap values without code changes. A new jurisdiction that needs genuinely new logic adds evaluators — that's a code review, which is appropriate for regulatory logic.

**Overrides.** Owners/admins can override a value per org (`org_rule_overrides`, with reason, audited). Every computed result records the pack version and whether an override applied.

**Admin screen** lists every rule, value, source, last-verified date, verification flag, and overrides.

**Deliverable:** `docs/RULES_VERIFICATION.md` generated from the pack files (so it can't drift) — one row per value with the official source to confirm. Every screen carrying a computed compliance status shows the "record-keeping tool; operator remains responsible for compliance" notice (part of the contract's shared layout props).

---

## 7. Integrity: hash chain and exports

**Canonicalization.** Records are serialized with RFC 8785 (JSON Canonicalization Scheme) over a defined field set per entity type, then SHA-256. Attached files contribute their stored `sha256`.

**Chain.** `ledger_entries(org_id, seq, entity_type, entity_id, entity_version, content_hash, prev_hash, entry_hash, at, actor)` where `entry_hash = H(prev_hash ‖ seq ‖ entity_type ‖ entity_id ‖ entity_version ‖ content_hash ‖ at)`. Entries are appended by the API in the same transaction as the write, serialized per org with `pg_advisory_xact_lock(org)`. Chained entities: flights, flight-battery links, checklist runs, maintenance events, incidents, credentials, documents. Edits append a new entry; nothing in the ledger is ever updated (privileges revoked + trigger guard).

**Verify integrity** recomputes each current record's canonical hash and walks the chain: reports broken links, records whose content no longer matches their latest entry, and audit rows with no actor (direct DB edits). This is exactly the Phase 5 gate test.

**Honest limitation + mitigation.** A DB superuser could, in principle, rewrite an entire org's chain consistently. To make that detectable, the worker publishes a **signed checkpoint** (Ed25519, key held in the environment/KMS, not in the DB) of the chain head daily, and every exported PDF embeds the chain head hash and signature. An operator holding any old export can prove later history wasn't rewritten. Optional later: email checkpoints to the org owner.

**PDF reproducibility.** Chromium output isn't byte-identical across versions, so the **verification hash is computed over the canonical data payload**, not the PDF bytes. The PDF prints that hash; `GET /verify/{hash}` (and an offline CLI) re-derives it. Templates pin fonts (bundled), set fixed document metadata, and render from a snapshot, so the same data + same renderer version produces the same file.

**Exports:** pilot logbook, aircraft logbook + maintenance history, org compliance packet (zip: PDFs + CSV + JSON + manifest with hashes + chain checkpoint), and full CSV/JSON dump of everything. All run as background jobs.

---

## 8. Offline-first mobile sync

**Choice: a custom sync protocol** (see §11 Q2 for the alternative). Reasons: it must work fully air-gapped with no extra service, writes must flow through the same API authorization, audit, and hash-chain path as web writes, and the conflict rules are domain-specific.

- **Device:** SQLite holds the subset the field app needs (own org's pilots, aircraft, batteries, sites, templates, recent flights, open missions, rule pack). Every local write goes to the table *and* an **outbox** of operations (`create|update|delete`, entity, id, changed fields, base version, HLC timestamp).
- **Push:** `POST /sync/push` sends outbox ops in order; each is validated and applied through normal domain services (so RLS, audit, ledger all apply). Response per op: `applied | merged | conflict | rejected(reason)`.
- **Pull:** `GET /sync/pull?cursor=` streams changes from a server change feed (`sync_changes`, monotonic per org) scoped to what the device subscribes to.
- **Conflict rules (deterministic):**
  1. *Creates never conflict* (client UUIDv7).
  2. *Append-only collections* (flight batteries, checklist responses, readings, notes on incidents) merge by union.
  3. *Field-level last-writer-wins by HLC* for ordinary mutable fields where both sides changed **different** fields → auto-merge.
  4. *Same field changed on both sides* for compliance-significant fields (flight times, PIC, aircraft, signed checklist runs, maintenance sign-offs) → **never auto-resolved**; stored in `sync_conflicts`, surfaced in a "Needs review" screen on both web and mobile, resolved by a human, audited.
  5. *Edits to a record deleted on the server* → conflict, surfaced.
  6. *Counters* (battery cycle count, aircraft totals) are never synced as values; they're derived server-side from flights, so offline devices can't double-count.
- **Readiness offline:** because the expiration/readiness engine lives in `core` and the rule pack is synced, the phone shows correct green/amber/red with no signal (flagged "as of last sync" if stale).
- Tested with a deterministic simulation harness (two devices + server, scripted interleavings) in Phase 2.

---

## 9. The contract for ChatGPT

Produced at the end of Phase 1 (as specified):

- `contract/types.ts` — re-exports domain types and **view-models** from `@certa/core`. View-models are already unit-converted and display-ready (e.g. `DateDisplay { iso, absolute, relative, tz }`, `Quantity { value, unit, display }`, `ReadinessStatus { level: 'green'|'amber'|'red', reasons[] }`), so components contain zero logic.
- `contract/openapi.yaml` — **generated** from the Fastify/Zod routes; CI fails if the committed file is stale.
- `contract/SCREENS.md` — every screen, route (web and mobile), props type, callback props, and empty/loading/error state requirements.
- `contract/fixtures/` — typed fixtures: solo pilot, 12-pilot service company, everything-expired, empty org, very long names, 500+ flights. Fixtures are type-checked in CI and also used by placeholder screens and Storybook-style previews.
- `contract/CHANGELOG.md` (semver) and `contract/FRONTEND_ISSUES.md`.

**Deviation (small):** I'll produce the *whole* screen inventory at the end of Phase 1, but view-models for Phase 3–7 screens will be marked `status: draft` and stabilized at the start of their phase. Locking every view-model before the underlying features exist would guarantee churn; marking them draft tells ChatGPT which screens are safe to polish now.

**Integration pattern:** `route → container (TanStack Query / sync store) → mapper (API DTO → view-model, in core, unit-tested) → <Screen {...viewModel} onX={...} />`. Placeholders in `src/screens/` render the same props unstyled until ChatGPT's version replaces them.

---

## 10. Other cross-cutting decisions

- **Expiration & alerts:** a nightly (and on-write) job computes `expiring_items` for every tracked thing using `core`; alert windows default 90/30/7 per org policy; deliveries deduped by (item, threshold, channel). Channels: email, Expo push, Slack/Discord webhooks. Daily digest for chief pilots/admins.
- **Pre-assignment checks and grounding** are domain services in `core` + API; admin override requires a reason and is audited.
- **Enrichment providers are pluggable** with an explicit "disabled" mode for air-gapped installs: weather (Open-Meteo historical by default, self-hostable), reverse geocoding (Nominatim, self-hostable), timezone lookup offline (bundled tz boundaries — no network needed).
- **Parsers:** pure functions `parse(bytes) → { flights[], confidence, warnings[] }`, no I/O, run in the worker. Order: PX4 ULog, ArduPilot `.bin`/`.tlog`, GPX/KML, generic CSV with mapping wizard, then documented third-party exports (e.g. Airdata CSV). **DJI `.txt` logs are encrypted in recent versions; we will not decrypt them** — we support DJI's official/third-party CSV export paths and document the limitation. Parser fixtures: real sample logs committed with licenses noted (PX4/ArduPilot publish test logs).
- **Time:** UTC `timestamptz` everywhere; flights store the IANA zone of the takeoff point; all display goes through `core` formatting ("Mar 14, 2027 — in 23 days").
- **Security:** CSRF protection for cookie sessions, rate limiting on auth routes, API keys hashed with scopes, outbound webhooks HMAC-signed, file uploads virus-scan hook (optional ClamAV container), secrets only via env.
- **Self-hosted:** `docker compose up` brings up caddy, web, api, worker, postgres+postgis, minio, mailpit (dev). `backup.sh`/`restore.sh` (pg_dump + MinIO mirror), `upgrade.sh` (migrate then roll), `/healthz` and `/readyz`.
- **AI module (Phase 7):** a separate package/service behind a feature flag, read-only DB role, answers must cite record IDs; "proposes, human confirms" enforced by giving it no write path at all.

---

## 11. Deviations from the prompt and open questions

**Deviations (please confirm):**
1. **PostgreSQL 16** instead of "15+" minimum — compatible with the requirement, just pinning a version.
2. **Draft view-models for later phases** in the Phase 1 contract (§9).
3. **PDF verification hash is over canonical data, not PDF bytes** (§7) — byte-reproducible PDFs across renderer versions aren't achievable with headless Chromium; this gives the same audit guarantee.
4. **Signed chain checkpoints** added beyond the prompt to close the "DB superuser rewrites the chain" gap (§7).
5. **No general rule DSL** — values are data, semantics are typed evaluators (§6).
6. **Counters derived server-side**, never synced (§8) — slightly more server work, removes a whole class of offline double-counting bugs.
7. **Phase 1 "auth" scope:** email+password and magic link in Phase 1; OIDC/SAML wired in Phase 7 as specified, but the schema and Better Auth configuration will accommodate it from day one.

**Questions where your answer changes the plan:**
- **Q1 — Auth library.** I recommend **Better Auth** (self-hosted, covers password, magic link, orgs, API keys, OIDC/SAML). Alternative: a hand-rolled auth module (more control, more security surface we own). OK to proceed with Better Auth?
- **Q2 — Sync engine.** I recommend the **custom protocol** above. Alternative: PowerSync (mature, has a self-hostable open edition, but adds a service to every install and its own replication path alongside our audit/ledger path). OK to proceed custom?
- **Q3 — Licensing of the repo / self-hosted distribution.** Affects which dependencies are acceptable (e.g. AGPL components). I'll avoid AGPL/SSPL dependencies by default unless told otherwise.
- **Q4 — Cloud target** for the second deployment target (AWS? other?). Not needed until later; defaults to "any container host + managed Postgres with PostGIS."

---

## 12. Phase 1 deliverables (on approval)

1. Monorepo scaffold (pnpm, Turborepo, shared configs, CI workflow: typecheck, lint, test, contract-staleness check).
2. `packages/db`: full schema for §5, SQL migrations for RLS, audit triggers, ledger table guards, PostGIS; seed script.
3. `packages/core`: Zod schemas, permission matrix, rule-pack schema + loader, US-FAA-Part107 pack (every value `needs_verification: true`), readiness/expiration engine skeleton with unit tests.
4. `apps/api`: Fastify with health checks, auth (password + magic link), orgs + memberships + roles, RLS request context, audit wiring, rule-pack read/override endpoints, OpenAPI generation.
5. `apps/web`: auth pages, org switcher, **rule pack admin screen** (placeholder UI), compliance notice.
6. `apps/mobile`: Expo shell with sign-in and SQLite initialized (sync lands in Phase 2).
7. `infra/docker/compose.yml` — one command brings up the stack; `README.md` (clone → running in < 10 min); `.env.example`.
8. `docs/RULES_VERIFICATION.md` (generated) and the `contract/` folder.

**Gate check I'll demonstrate:** `docker compose up` → sign up → rule pack visible in admin; `pnpm test` green including RLS cross-tenant tests and audit-trigger tests.

---

## 13. Decisions made during Phase 1 (approved plan → implementation)

Approved 2026-10-08 ("go ahead with whatever you recommend"): Better Auth, custom sync protocol, no AGPL/SSPL dependencies, cloud target deferred.

| Decision | Why |
|---|---|
| **SeaweedFS** instead of MinIO as the bundled S3 store | MinIO no longer publishes community container images (Docker Hub and quay.io pulls fail). SeaweedFS is Apache-2.0 and S3-compatible; Garage was rejected as AGPL. Any S3 endpoint still works via `S3_ENDPOINT`. |
| `auth_verifications.id` is `text`, not `uuid` | Better Auth looks verification rows up by opaque string keys (magic links). Other auth tables keep UUIDv7 ids. |
| Argon2id password hashing configured explicitly | Better Auth defaults to scrypt; the plan specified Argon2id (OWASP parameters). |
| React 19.2.3 across web and mobile | Expo SDK 57 pins React 19.2.3; one React version in the hoisted workspace avoids duplicate-React bugs. |
| Contract screens carry a `beta` status in addition to `stable`/`draft` | The frontend asked for the Phase 2 core-loop screens now (`docs/UI-HANDOFF.md`). `beta` = build now, additive changes only. |
| Screens no longer receive `shell`; they render inside `<AppShell>` | Cleaner separation; shell gained `navigation`, `sync`, and `theme` per the UI handoff. |
| Fixtures are generated by the same `@certa/core` mappers the containers use | A component that renders fixtures correctly renders real data correctly; CI fails if fixtures are stale. |
| Rate limiting at the Fastify layer, not Better Auth's | One consistent limiter across all routes. |

## 14. Revision: Certa lives inside the Arkhon website (2026-10-08)

Decided with the user after Phase 1: Certa is served at **arkhonindustries.com/certa**; the field
app is the **web app installed as a PWA** (the Expo app is retired); Certa keeps **its own accounts**
(OIDC/SSO later); the **self-hosted tier stays**.

| Area | Change |
|---|---|
| Hosting | Base path is configurable (`BASE_PATH`, `PUBLIC_URL` includes it): `/certa` hosted, `''` self-hosted. The API serves under `{base}/api`; Next.js `basePath`; Caddy routes `{base}/api/*`. The Arkhon site forwards `/certa/*` with one rewrite: `docs/ARKHON_SITE_INTEGRATION.md`. |
| Cookies | `certa.`-prefixed, `Path=/certa`, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, so they never reach the rest of the site. |
| Rate limiting | `CLIENT_IP_HEADER` (e.g. `cf-connecting-ip`) so limits apply per visitor behind the site proxy. |
| Field app | `apps/mobile` removed. The web app has a manifest and a service worker scoped to the base path; it installs and opens offline. Phase 2 moves the §8 sync design to the browser: the device store becomes **IndexedDB** (outbox, change cursor, synced tables) instead of SQLite; the protocol and conflict rules are unchanged. |
| Contract | 0.3.0: `AppShellViewModel.basePath`; components are React DOM only and responsive. |
| Risk accepted | Same origin as the marketing site: its scripts share Certa's trust boundary, including offline IndexedDB data. Documented with mitigations; moving to `certa.arkhonindustries.com` later needs only config. |
| iOS | Installed web apps get no background sync, and storage may be evicted after weeks unused. Queued changes sync on next open; unsynced state is shown prominently. |

Sections 1–3 and 8 above describe the original native-app design; this section supersedes them where they differ.
