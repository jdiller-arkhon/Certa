# Certa

**Flight operations & compliance logbook for commercial drone operators — by Arkhon Industries.**

When an auditor, insurer, client, or regulator asks "prove it," Certa produces a complete, trustworthy record in under 60 seconds.

> Certa is a record-keeping tool. Operators remain responsible for compliance with all applicable regulations. Regulatory values shipped in rule packs are pending verification — see [`docs/RULES_VERIFICATION.md`](docs/RULES_VERIFICATION.md).

---

## Run the full stack (about 5 minutes)

Requirements: **Docker** with Compose v2, and `openssl`. Node is not required.

```bash
git clone https://github.com/jdiller-arkhon/Certa.git && cd Certa
infra/scripts/init-env.sh                         # writes .env with generated secrets
docker compose -f infra/docker/compose.yml --env-file .env up -d --build
```

Then open **http://localhost:8080**, create an account, and go to **Rule pack** in the navigation.

| URL | What |
|---|---|
| http://localhost:8080 | Certa (web app + API behind Caddy on one origin) |
| http://localhost:8080/readyz | API readiness (database check) |
| http://localhost:8025 | Mailpit: catches every email (magic links, invites) in development |

The stack: `postgres` (PostgreSQL 16 + PostGIS), `migrate` (one-shot: migrations, app DB role, rule packs, job queue), `api`, `worker`, `web`, `caddy`, `objects` (S3-compatible storage), `mailpit`. Nothing calls out to the internet.

Stop with `docker compose -f infra/docker/compose.yml --env-file .env down` (add `-v` to delete data).

## Develop locally

Requirements: Node 22+, pnpm 10 (`corepack enable`), Docker (for Postgres/PostGIS and Mailpit).

```bash
pnpm install
infra/scripts/init-env.sh        # if you haven't already
pnpm services:up                 # postgres, mailpit, object storage + migrations, exposed on localhost
pnpm build                       # build shared packages once (core, db, rulepacks, sdk)
pnpm dev                         # API on :4000 (watch) + web on :3000 (proxies /api to :4000)
```

Open http://localhost:3000. The mobile app: `pnpm --filter @certa/mobile start`. Set `EXPO_PUBLIC_API_URL` to an origin your phone can reach, and add it to `TRUSTED_ORIGINS`.

### Tests

```bash
pnpm typecheck                   # every package, strict TypeScript
pnpm test                        # unit (core, rule packs, contract) + integration (db, api) against real Postgres
pnpm --filter @certa/web test:e2e                                  # Playwright: starts its own API + web
E2E_BASE_URL=http://localhost:8080 pnpm --filter @certa/web test:e2e   # …or against the running Docker stack
pnpm contract:check              # openapi.yaml, SDK types, fixtures, RULES_VERIFICATION.md are current
```

Integration tests create throwaway databases on the server in `TEST_PG_SERVER_URL` (default `postgres://postgres:postgres@localhost:5432`) and connect as a non-superuser role, so row-level security is exercised for real.

## Repository layout

```
apps/
  api/        Fastify REST API, Better Auth, pg-boss worker, migrator entrypoint
  web/        Next.js dashboard — containers (data) + screens (presentational, from the frontend)
  mobile/     Expo field app — offline-first SQLite
packages/
  core/       Domain types, Zod schemas, permissions, rule engine, readiness engine, view-model mappers
  db/         Drizzle schema, SQL migrations (RLS, audit triggers), test database helper
  rulepacks/  Versioned regulatory rule packs (YAML) + verification doc generator
  sdk/        Typed API client generated from contract/openapi.yaml
  ui/         Design tokens, theme CSS, Tailwind preset (frontend-owned)
  config/     Shared tsconfig
contract/     Frontend contract: types, SCREENS.md, openapi.yaml, fixtures, CHANGELOG
infra/        Dockerfile, Compose, Caddyfile, backup/restore/upgrade scripts
docs/         Architecture plan, rules verification checklist, UI handoff
```

## Key guarantees (and where they're enforced)

| Guarantee | Enforced by |
|---|---|
| Tenants can never see or modify each other's data | Postgres row-level security (`FORCE`), app connects without `BYPASSRLS`: `packages/db/migrations/0001_security.sql`, tests in `packages/db/test/security.test.ts` |
| Every change is recorded: who, what, when, before/after | Database triggers write `audit_events`; append-only even for the owner role |
| Direct database edits are detectable | Audit rows carry the DB role and a null actor for out-of-band changes |
| Regulatory values are data, not code | Rule packs in `packages/rulepacks/packs/<jurisdiction>/<version>.yaml`, immutable once loaded, overridable per org with an audited reason |

## Self-hosted operations

```bash
infra/scripts/backup.sh [dir]        # pg_dump + object storage archive + SHA-256 manifest
infra/scripts/restore.sh <backup>    # verifies checksums, restores, re-runs the migrator
infra/scripts/upgrade.sh             # backup → rebuild → migrate → restart
```

Health: `GET /healthz` (liveness), `GET /readyz` (database). Logs are structured JSON on stdout.

**HTTPS:** set `CERTA_SITE_ADDRESS=certa.example.com`, `PUBLIC_URL=https://certa.example.com`, publish ports 80 and 443 on the `caddy` service, and Caddy obtains certificates automatically. For an internal CA or air-gapped networks, mount your certificate and use Caddy's `tls` directive.

**Email:** set `SMTP_URL` to your relay and remove `mailpit`.
**Object storage:** set `S3_ENDPOINT`/credentials to AWS S3 or any S3-compatible store and remove `objects`.

## Documentation

- [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md): architecture and decisions
- [`docs/RULES_VERIFICATION.md`](docs/RULES_VERIFICATION.md): every regulatory value to verify before launch (generated)
- [`contract/README.md`](contract/README.md): frontend contract
- [`docs/UI-HANDOFF.md`](docs/UI-HANDOFF.md): UI foundation notes from the frontend
