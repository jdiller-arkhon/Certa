# Contract Changelog

The contract (`types.ts`, `openapi.yaml`, `SCREENS.md`, `fixtures/`) is versioned with semver.
Every change lists the screens affected so the frontend knows what to update.

## 0.3.0 — 2026-10-08

Certa now runs **inside the Arkhon website at `/certa`** as a single web app, installable on phones as a PWA. The native mobile app is retired.

- **Added** `AppShellViewModel.basePath` (`'/certa'` hosted, `''` self-hosted). `AppShell` renders real links as `basePath + href`; screens navigate through callbacks.
- **Changed** fixtures: `FixtureScenario.mobileShell` → `fieldShell`; every fixture shell has `basePath: '/certa'`.
- **Changed** `SCREENS.md`: one route column (app-relative paths); components target React DOM only and must be responsive (desktop dashboard and phone field layout). The React Native / NativeWind target in `docs/UI-HANDOFF.md` no longer applies.
- **Changed** offline state now means "installed app in the field" (browser IndexedDB sync), not a native app.

Screens affected: **AppShell** (new `basePath`; responsive bottom-tab layout on phones); **all screens** (no React Native variants needed). No prop shapes changed apart from `basePath`.

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
