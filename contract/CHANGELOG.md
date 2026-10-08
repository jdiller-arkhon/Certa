# Contract Changelog

The contract (`types.ts`, `openapi.yaml`, `SCREENS.md`, `fixtures/`) is versioned with semver.
Every change lists the screens affected so the frontend knows what to update.

## 0.2.0 — 2026-10-08

Initial published contract (Phase 1).

- **Added** `AppShellProps` (layout): `navigation`, `sync` (`SyncStateViewModel`), `theme` (`light | dark | sunlight`), `onThemeChange`, `onSyncNow`. Requested in `docs/UI-HANDOFF.md`.
- **Changed** screens no longer receive a `shell` prop; they render inside `<AppShell>`.
- **Stable:** Sign in, Sign up, Rule pack admin, Members, Organization settings, Audit log, AppShell.
- **Beta:** Today (readiness), Pilots, Pilot detail, Pilot form, Aircraft, Aircraft detail, Aircraft form, Batteries, Flights, Flight detail, Quick log flight, Sync conflicts.
- **Draft:** Import, Maintenance, Checklists, Incidents, Records, Missions, Analytics, Assistant.
- **Fixtures:** scenarios `solo`, `company`, `expired`, `empty`, `longNames`, `large` (520 flights); `auth`; `states`; `syncStates`.
- **API:** `openapi.yaml` covers auth/session, organizations, members, rule packs and overrides, and the audit log.

Screens affected: all (first release).

## 0.1.0 — 2026-10-08

Unpublished internal draft (architecture plan).
