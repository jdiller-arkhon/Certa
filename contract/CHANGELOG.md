# Contract Changelog

The contract (`types.ts`, `openapi.yaml`, `SCREENS.md`, `fixtures/`) is versioned with semver.
Every change lists the screens affected so the frontend knows what to update.

## 0.13.0 — 2026-10-18

Argus mission flights count toward Certa flight time.

- **Added** `ExternalFlight` (pilot, source `argus`, Argus job id and reference, takeoff/landing, duration, location) and `FleetSnapshot.externalFlights` (those still waiting for the drone). They count in `pilotTotals` (flights, missions, flight time, last 90 days, last flight).
- **Added** `POST /integrations/argus/flights` for Argus (bearer `ARGUS_INGEST_TOKEN`): idempotent per `jobId`, links or creates the pilot's Certa account like Arkhon sign-in. A resend updates changed times; a converted or dismissed flight is left alone.
- **Added** `POST /orgs/{orgId}/external-flights/{id}/convert { aircraftId }` → `{ flightId }` (a regular flight, source `import`, parser `argus`) and `DELETE /orgs/{orgId}/external-flights/{id}` (dismiss; a resend won't bring it back). Pilots may do this for their own flights.
- **Changed** **Pilot detail**: new `pilot.argus`, `argusFlights: ArgusFlightViewModel[]`, `aircraftOptions`, `canConvertArgus`, `onConvertArgusFlight`, `onDismissArgusFlight`.
- **Changed** Discord bot `flight-totals` (every window) and the leaderboard include Argus flights waiting for the drone.
- **Changed** **Log flight / Flight detail** go / no-go: new `conditions` check (worst weather, airspace, TFR and daylight advisory; standing reminders like "Check NOTAMs" don't count; "Not checked" is Caution), so a red advisory makes the verdict No-go. New `conditionsCheck()` and `withCheck()`. The server keeps the device's conditions row as "Conditions (checked on device)".
- **Changed** Expiry reminders cover waivers, airspace authorizations, COAs and LAANC approvals with an end date (managers, plus the pilot it belongs to).

Screens affected: **Pilot detail**, **Log flight**, **Flight detail**.

## 0.12.0 — 2026-10-18

One account across Arkhon.

- **Added** Arkhon single sign-on: `POST /api/auth/arkhon/exchange` turns the Arkhon (Argus) session the browser already has into a Certa session, creating or linking the Certa account (by Arkhon id, else verified email). Arkhon pilots get their own logbook; Arkhon admins join `ARKHON_ORG_ID` as admins; clients get an account with no organization.
- **Added** `GET /api/v1/auth/config` (public): `{ local, arkhon: { loginUrl, signupUrl } | null }`. `MeResponse.arkhon: { role, platformAdmin } | null`.
- **Changed** `LOCAL_AUTH=off` closes Certa's own sign-up, password, magic-link, reset and change-email endpoints (403).
- **Changed** **Sign in**: new `localAuth`; with it false the screen offers only `ssoProviders` and "create one" goes to the provider's sign-up. Fixture `auth.signInArkhon`.

Screens affected: **Sign in**.

## 0.11.0 — 2026-10-18

Prior experience from other apps.

- **Added** `PriorExperience` (pilot, source app, flights, missions, flight seconds, as-of date, notes) and `FleetSnapshot.priorExperience`; `PilotTotals.missions` (distinct missions with a flight the pilot commanded).
- **Added** `POST /orgs/{orgId}/pilots/{pilotId}/prior-experience`, `PATCH|DELETE /orgs/{orgId}/prior-experience/{priorId}` (same rights as credentials: own record for pilots).
- **Changed** **Pilot detail**: `pilot.totals` is now all-time including prior experience and adds `missions`; new `pilot.logged`, `pilot.prior`, `priorExperience: PriorExperienceViewModel[]`, and `onAddPriorExperience`, `onUpdatePriorExperience`, `onRemovePriorExperience`. **Pilots** list flight time includes prior experience.
- **Changed** Discord bot `flight-totals` all-time figures and the all-time leaderboard include prior experience; date windows and monthly boards don't. The inspector packet lists it as a separate self-reported fact.

Screens affected: **Pilot detail**, **Pilots**.

## 0.10.0 — 2026-10-11

Conditions, push, and customer 3D models.

- **Added** `GET /orgs/{orgId}/conditions?lat&lon` → `ConditionsResponse` (airspace from the FAA UAS Facility Map, nearest NWS observation, civil daylight, `advisories`). `LogFlightScreenProps.conditions` + `onCheckConditions`; checked conditions save the takeoff point, weather, and airspace class with the flight.
- **Added** Web Push: `GET /push/config`, `POST /orgs/{orgId}/push-subscriptions`, `/remove`, `/test`. `OrgSettingsScreenProps.notifications` + `onToggleNotifications`, `onTestNotification`.
- **Added** aircraft 3D models: `PUT|GET|DELETE /orgs/{orgId}/aircraft/{aircraftId}/model` (self-contained GLB 2.0, ≤ 20 MB). `Aircraft.modelDocumentId`; `ReadinessRowViewModel.modelUrl` (hangar renders the uploaded model, falling back to the drawn airframe); `AircraftDetailScreenProps.model` + `onUploadModel`, `onRemoveModel`.

## 0.9.0 — 2026-10-11

Machine verification for Argus.

- **Added** org API keys: `POST/GET /orgs/{orgId}/api-keys`, `DELETE /orgs/{orgId}/api-keys/{keyId}` (`integrations.manage`). Key format `ck_<12 hex>_<43 base64url>`; returned once, stored as SHA-256, compared in constant time; scope `verify:read`; optional expiry.
- **Added** bearer-authenticated verification: `GET /verify/pilots/{pilotId}`, `GET /verify/aircraft/{aircraftId}`, `GET /verify/lookup?certificateNumber=|registration=|serialNumber=` → `VerificationResult` (`legalToFly`, `status`, `reasons`), and `POST /verify/flight` → go / no-go. Keys see only their own org; rate-limited per key.
- **Added** `IntegrationsScreenProps` (route `/admin/integrations`, nav item `integrations`).

## 0.8.0 — 2026-10-11

Inspector packets.

- **Added** share links: `POST /orgs/{orgId}/share-links` (time-boxed 1–30 days; the secret URL is returned once and stored only as a SHA-256 hash), `GET /orgs/{orgId}/share-links`, `POST /orgs/{orgId}/share-links/{linkId}/revoke`.
- **Added** public, no-account `GET /public/share/{token}` → `PublicPacketResponse` (`InspectorPacket` + seal) and `GET /public/share/{token}/packet.pdf` (sealed PDF). Responses are `no-store`, `noindex`, `no-referrer`, rate-limited; unknown, expired, and revoked links all return 404.
- **Added** `InspectorPacket` and `buildInspectorPacket` in `@certa/core`; the seal is `contentHash(packet)` (RFC 8785 + SHA-256).
- **Added** `SharePacketViewModel` with `share`, `onCreateShareLink`, `onRevokeShareLink` on **Pilot detail** and **Aircraft detail**; new public screen `SharedPacketScreenProps` at `/share/[token]`.

## 0.7.0 — 2026-10-11

Phase 2 web: every Phase 2 screen is built, plus Maintenance and Insurance.

- **Added** `MaintenanceScreenProps` (beta, was draft): due rows (`MaintenanceDueRowViewModel` with interval, usage, due date, status, `grounds`, `targetKey`), history (`MaintenanceHistoryRowViewModel`), `targetOptions`, `onAddSchedule`, `onLogMaintenance`, `onRemoveSchedule`. Builder `buildMaintenance(input, events)`.
- **Added** `InsuranceScreenProps` (beta, route `/insurance`): policies with status and covered aircraft, `uncoveredAircraft`, `onAddPolicy`, `onRemovePolicy`. Builder `buildInsurance`. Nav items `maintenance` and `insurance` (`NavIcon` gains `'insurance'`).
- **Added** `LogFlightScreenProps.preflight: GoNoGoResult | null` and `onSelectionChange` — the host recomputes the go / no-go (from records on file, offline too) as the pilot picks pilot, aircraft, and batteries. `defaults` gains `locationName`, `maxAltitude`, `notes` (prefilled when editing). Aircraft options gain `model`; battery options gain `aircraftModel` so the form can show only batteries that fit.
- **Added** `FlightDetailScreenProps.preflight` — the check stored with the flight.
- **Added** `BatteryListScreenProps`: `aircraftModelOptions`, `saving`, `fieldErrors`, `onCreateBattery`, `onRetireBattery` (the screen owns the add-battery dialog).
- **Added** `PilotDetailScreenProps.onUpdateCredential` and `onRemoveCredential` (the screen owns the edit dialog).
- **Changed** `buildReadinessDashboard`: with no aircraft and no credentials on file, Today shows first-run onboarding instead of flagging the owner's auto-created pilot record.
- **Changed** fixtures: sample insurance policies and maintenance schedules/history, so readiness now includes insurance expiry and maintenance.

Screens affected: **Log flight, Flight detail, Battery list, Pilot detail, Today**, new **Maintenance** and **Insurance**.

## 0.6.0 — 2026-10-11

Phase 2 API and shared screen builders.

- **Added** `GET /orgs/{orgId}/fleet` → `FleetSnapshot`: the org, its rule pack and overrides, pilots, credentials, aircraft, batteries, insurance policies, maintenance schedules, per-pilot flight totals, battery last-used times, the last flight, and recent locations. Containers build every Phase 2 screen from it; the offline app caches it.
- **Added** screen builders in `@certa/core` (`buildReadinessDashboard`, `buildPilotList`, `buildPilotDetail`, `buildAircraftList`, `buildAircraftDetail`, `buildBatteryList`, `buildFlightList`, `buildFlightDetail`, `buildLogFlight`). The fixtures are now generated by these same builders.
- **Added** CRUD routes for pilots, credentials, training records, aircraft (plus `/ground` and `/return-to-service`), batteries, insurance policies, maintenance schedules and events; flights with cursor paging and idempotent create (client-supplied `id`); `POST /orgs/{orgId}/preflight` (go / no-go).
- **Added** readiness checks: missing Remote ID (`aircraft.remote_id.required`), takeoff mass over the pack limit (`aircraft.max_takeoff_mass`), insurance expiry per covered aircraft, and maintenance due by flight hours, flights, or days (blocking when the schedule grounds on overdue).
- **Changed** fixtures: flight detail `weatherSummary` and `authorizationRef` now come from the flight (null in fixtures, which carry no weather); Log flight site options are the org's recent locations; the default takeoff time is "now" rounded to 5 minutes.

Screens affected: **all Phase 2 screens** (data now real). Prop shapes unchanged.

## 0.5.0 — 2026-10-10

- **Added** `ReadinessRowViewModel.airframe?: Airframe` (`'quad' | 'hex' | 'octo' | 'fixed_wing_vtol'`), set on aircraft rows only. Derived from make and model in `@certa/core` (`airframeOf`); unknown models draw as `quad`. Used by the Today hangar to draw each aircraft.
- **Changed** fixtures: the sample fleet now includes a Quantum Systems Trinity F90+ (fixed-wing VTOL), a DJI Matrice 600 Pro (hex) and a Freefly Alta 8 (octo).

Screens affected: **Today (readiness)**. Additive only.

## 0.4.0 — 2026-10-09

- **Added** `RuleRowViewModel.editor: RuleEditor` — the override editor's input type, display unit, and current value **in the org's display units** (e.g. `{ input: 'number', unit: 'ft', value: 400 }`). `onSetOverride` now receives the value in those same units; the host converts to SI. Components still never convert units.
- **Changed** `onSetOverride` semantics as above (previously SI).

Screens affected: **Rule pack admin**.

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
