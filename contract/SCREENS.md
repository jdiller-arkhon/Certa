# Certa Screen Inventory

**Contract version 0.3.0** (see `CHANGELOG.md`). Types: `contract/types.ts`. Fixtures: `contract/fixtures/`.

Each screen is one presentational component that takes `XxxScreenProps` from `types.ts`. It
renders inside `<AppShell>` and never fetches data, holds server state, or computes anything
regulatory.

**Platform: one web app.** Certa runs inside the Arkhon website at `/certa` and is installable on
phones as a PWA ("Add to Home Screen") for field use, including offline. There is no native app,
so every component is React DOM and must be responsive: dense dashboard on desktop, glove-friendly
field layout on phones (48px minimum targets, 56px primary field actions, `sunlight` theme).

## Status legend

| Status | Meaning |
|---|---|
| **stable** | Build and polish now. Breaking changes require a major contract version bump. |
| **beta** | Build now. Fields may be **added** when the screen's phase starts; nothing will be removed or renamed without a CHANGELOG entry. |
| **draft** | Placeholder shape only. Don't invest in visuals yet; it will change when its phase starts. |

## Rules for every screen

1. **Navigation and the base path.** Every `href` in view-models is app-relative (`/pilots/…`). Inside screens, navigate with the callbacks (`onOpen`, `onOpenPilot`, …). Only `AppShell` renders real `<a>` links, and it must use `basePath + href` (`AppShellViewModel.basePath` is `/certa` when hosted). Never hard-code `/certa`.
2. **Data in, callbacks out.** Props are the only input. User intent leaves through callback props (`onX`). Forms are controlled by the host: a form calls `onSubmit(values)` and the host returns `fieldErrors` and `saving`.
3. **Never compute compliance.** Readiness levels, expiry dates, "days remaining", units, and date formatting all arrive pre-computed (`StatusBadge`, `DateDisplay`, `Quantity`, `ReadinessReason`). Render `display` strings as given.
4. **Status = color + icon + text.** `StatusBadge.level` is `green | amber | red`; always show `label` with an icon too, never color alone. Theme tokens: `--certa-current` (green), `--certa-warning` (amber), `--certa-expired` (red), `--certa-grounded` (grounded aircraft), `--certa-pending` (pending sync).
5. **Dates.** `DateDisplay.display` is "Mar 14, 2027 — in 23 days". Use `absolute` and `relative` separately when the layout needs it. Flight times are already in the flight location's zone.
6. **Numbers.** Render `Quantity.display` in tabular/monospace figures (`.certa-number`).
7. **Empty states.** Every list screen has `empty: EmptyState`. Show `title` and `body`; if `actionLabel` is non-null, render a primary button wired to the screen's primary callback (listed in the table below).
8. **Compliance notice.** `AppShellViewModel.complianceNotice` must be visible on every screen that shows a status (a footer line is fine).

## States

Every screen extends `AsyncState { loading, error }`. Interpret them like this:

| State | Props | Render |
|---|---|---|
| Loading (first load) | `loading: true`, data empty or null | Skeletons. |
| Loaded | `loading: false`, `error: null` | Data, or the `empty` state when the list is empty. |
| Error | `loading: false`, `error: string`, no data | The error message with a retry affordance (wire it to `onNavigate(currentHref)` in the shell). |
| Partial / refreshing | `loading: true` **and** data present | Show the data with a subtle progress indicator. Never blank the screen. |
| Stale with error | `loading: false`, `error: string`, data present | Data plus a non-blocking banner. |
| Offline (installed app in the field) | `shell.sync.status === 'offline'` | Banner from `shell.sync.message`; rows with `pendingSync: true` get a pending marker. Everything stays usable. |

Fixtures for each: `states.*` and `syncStates.*` in `contract/fixtures/index.ts`.

## Layout

| Component | Status | Props | Callbacks | Notes |
|---|---|---|---|---|
| `AppShell` | stable | `AppShellProps` = `AppShellViewModel` + callbacks | `onSwitchOrg`, `onSignOut`, `onNavigate`, `onThemeChange`, `onSyncNow` | Wide screens: sidebar or top nav from `navigation` (already filtered by permission). Narrow screens / installed app: bottom tabs for `today`, `flights`, `pilots`, `aircraft` plus a "More" menu. Links use `basePath + href`. Respect safe-area insets (`env(safe-area-inset-*)`) in standalone mode. Shows `sync` state, `conflictCount` badge linking to `/sync/conflicts`, org switcher when `orgOptions.length > 1`, theme picker (`light`/`dark`/`sunlight`). |

## Screens

Routes are app-relative Next.js paths; in the browser they appear under the base path (e.g. `/certa/pilots`).

### Auth — stable

| Screen | Route | Props | Callbacks | Fixtures |
|---|---|---|---|---|
| Sign in | `/sign-in` | `SignInScreenProps` | `onSubmitPassword`, `onRequestMagicLink`, `onSignInWithSso`, `onGoToSignUp` | `auth.signIn`, `auth.signInMagicLinkSent`, `auth.signInError` |
| Sign up | `/sign-up` | `SignUpScreenProps` | `onSubmit`, `onGoToSignIn` | `auth.signUp` |

Sign-in shows a "check your email" confirmation when `magicLinkSentTo` is set. Hide SSO buttons when `ssoProviders` is empty.

### Administration — stable (Phase 1)

| Screen | Route | Props | Callbacks | Primary action | Fixture key |
|---|---|---|---|---|---|
| Rule pack | `/admin/rules` | `RulePackAdminScreenProps` | `onFilterChange`, `onSetOverride`, `onClearOverride`, `onSelectJurisdiction` | — | `screens.rulePackAdmin` |
| Members | `/admin/members` | `MembersAdminScreenProps` | `onInvite`, `onChangeRole`, `onSetExpiry`, `onRemove` | `onInvite` | `screens.membersAdmin` |
| Organization settings | `/settings/organization` | `OrgSettingsScreenProps` | `onSave` | — | `screens.orgSettings` |
| Audit log | `/admin/audit` | `AuditLogScreenProps` | `onFilterChange`, `onLoadMore` | — | `screens.auditLog` |

Rule pack notes:
- Show the pack header (`name`, `version`, `authority`, `effectiveFrom`, `disclaimer`) and an **"N of M values pending verification"** notice from `unverifiedCount`.
- Each rule row shows `title`, `valueDisplay`, `statedAs`, `sourceCitation` (linked to `sourceUrl`), `lastVerified` or "Not yet verified", and a `needsVerification` marker.
- When `override` is set, show the effective value, the pack value (`packValueDisplay`) struck through or secondary, and the override reason, author and date.
- Override editor (only when `canOverride`): input by `valueKind`, plus a required reason. It calls `onSetOverride({ ruleId, value, reason })` with the value in **SI** (metres, m/s, kg, cents, or `{ amount, unit, roundTo }` for durations). The host converts from display units before calling the API.

Audit log notes: show `actorLabel`. **"Direct database change"** (no actor) is a red flag; give it a warning treatment. `changes` lists field-level before → after.

### Core loop — beta (Phase 2)

| Screen | Route | Props | Callbacks | Primary action | Fixture key |
|---|---|---|---|---|---|
| Today (readiness) | `/` | `ReadinessDashboardScreenProps` | `onAddPilot`, `onAddAircraft`, `onLogFlight`, `onOpen` | `onAddAircraft` (empty) / `onLogFlight` | `screens.readinessDashboard` |
| Pilots | `/pilots` | `PilotListScreenProps` | `onSearch`, `onAddPilot`, `onOpenPilot` | `onAddPilot` | `screens.pilotList` |
| Pilot detail | `/pilots/[pilotId]` | `PilotDetailScreenProps` | `onEditPilot`, `onAddCredential`, `onEditCredential`, `onExportLogbook`, `onOpenFlight` | `onAddCredential` | `screens.pilotDetail` |
| Pilot form | `/pilots/new`, `/pilots/[pilotId]/edit` | `PilotFormScreenProps` | `onSubmit`, `onCancel` | `onSubmit` | — (form defaults are empty strings) |
| Aircraft | `/aircraft` | `AircraftListScreenProps` | `onSearch`, `onStatusFilter`, `onAddAircraft`, `onOpenAircraft` | `onAddAircraft` | `screens.aircraftList` |
| Aircraft detail | `/aircraft/[aircraftId]` | `AircraftDetailScreenProps` | `onEdit`, `onGround`, `onUnground`, `onExportLogbook`, `onOpenFlight` | — | `screens.aircraftDetail` |
| Aircraft form | `/aircraft/new`, `/aircraft/[aircraftId]/edit` | `AircraftFormScreenProps` | `onSubmit`, `onCancel` | `onSubmit` | — |
| Batteries | `/batteries` | `BatteryListScreenProps` | `onAddBattery`, `onOpenBattery` | `onAddBattery` | `screens.batteryList` |
| Flights | `/flights` | `FlightListScreenProps` | `onFilterChange`, `onLoadMore`, `onLogFlight`, `onImport`, `onOpenFlight` | `onLogFlight` | `screens.flightList` |
| Flight detail | `/flights/[flightId]` | `FlightDetailScreenProps` | `onEdit`, `onDelete` | — | `screens.flightDetail` |
| **Quick log flight** | `/flights/new` | `LogFlightScreenProps` | `onSameAsLast`, `onSubmit`, `onCancel` | `onSubmit` | `screens.logFlight` |
| Sync conflicts | `/sync/conflicts` | `SyncConflictsScreenProps` | `onResolve` | — | `screens.syncConflicts` |

Today notes: answer **"Is every pilot and aircraft legal to fly today?"** at a glance using `overall`, `counts`, and two lists (pilots, aircraft) with `reasons`. `upcoming` is the soonest-first list of everything due within 90 days.

Quick log flight notes (phone, installed app, under 30 seconds):
- Every field is pre-filled from `defaults` (last flight). `onSameAsLast` re-applies them.
- Large touch targets: 48px minimum, 56px for primary field actions.
- Pickers show `recent` items first and each option's `status` badge.
- `warnings` (for example "Recurrent training expired") are **informational and never block submission**. The pilot remains responsible.
- `onSubmit` sends ISO instants (`takeoffAt`, `landingAt`) and `maxAltitude` in the **display unit** shown by `altitudeUnitLabel`. The host converts to SI.
- Works fully offline in the installed app. The host stores the flight in IndexedDB, and it appears in lists with `pendingSync: true` until synced.

Flight detail: `path` is GeoJSON (`LineString`, coordinates `[lon, lat, altMslM]`), and `altitudeProfile` uses `t` in seconds from takeoff and `altitude` in display units. The host supplies the map component and tile source (MapLibre). The screen just renders it.

### Later phases — draft

| Screen | Phase | Route | Props |
|---|---|---|---|
| Import logs | 3 | `/flights/import` | `ImportScreenProps` |
| Maintenance | 4 | `/maintenance` | `MaintenanceScreenProps` |
| Checklists | 4 | `/checklists` | `ChecklistsScreenProps` |
| Incidents | 4 | `/incidents` | `IncidentsScreenProps` |
| Records & exports | 5 | `/records` | `RecordsScreenProps` |
| Missions | 6 | `/missions` | `MissionsScreenProps` |
| Analytics | 6 | `/analytics` | `AnalyticsScreenProps` |
| Assistant (optional module) | 7 | `/assistant` | `AssistantScreenProps` |

## Where data comes from (for reference)

Containers (Claude Code) fetch through `@certa/sdk` / TanStack Query online and read the
browser sync-engine store (IndexedDB) offline. They map API responses to these view-models using the mappers in
`@certa/core` (`packages/core/src/viewmodels/mappers.ts`). The fixtures are generated by
those same mappers, so a component that renders the fixtures correctly will render real data
correctly.
