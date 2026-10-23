# Live telemetry (drone link, phase 2)

Linked drones stream their state to Certa while they fly. Certa shows them on the **Live** page
and logs the flight automatically when the drone lands, with the same track, height, distance and
battery data a log import gives.

Status: built and tested locally. **Not deployed** — it needs the owner's release approval and
the two external pieces listed under "What's needed to turn it on".

## How data gets in

```
DJI Pilot 2 / DJI Dock ──MQTT──▶ message server (EMQX) ◀──MQTT── Certa worker (live bridge)
                                   │  auth / acl hooks                     │
                                   └──HTTP──▶ Certa API ◀──────────────────┘ writes sessions, flights
Other bridges (MAVLink forwarder, Skydio, Autel) ──HTTPS──▶ POST /api/v1/integrations/live/frames
```

1. **DJI enterprise (Cloud API).** A pilot opens DJI Pilot 2 → Cloud Service → Open Platform and
   enters `https://<certa>/live/link`. That page (inside Pilot 2's web view) verifies Certa's DJI
   license, reads the controller and aircraft serials, calls
   `POST /orgs/:orgId/live/devices/bind`, and hands Pilot 2 a per-controller message-server
   credential (`lv_<12 hex>` + a random secret, stored hashed). Pilot 2 then publishes:
   - `sys/product/{gateway}/status` — topology (which aircraft is attached). The bridge answers on
     `status_reply`, as DJI requires, and records the aircraft serial.
   - `thing/product/{aircraft}/osd` — position, height, speed, battery packs, GPS, wind, mode
     (about 0.5–2 Hz).
   - `thing/product/{gateway}/events` — HMS health warnings, kept on the flight.
2. **Other bridges** send the same frame shape (`LiveFrame` in `packages/core/src/api/schemas.ts`)
   with an API key that has the `live:write` scope.

## Sessions and auto-logging (`packages/core/src/live/session.ts`)

- A session opens on the first airborne frame (the 10 frames before take-off are kept).
- It ends after 20 s on the ground, or 2 min with no data (the worker sweeps every 30 s).
- On end, `LiveProcessor.finalize` creates the flight: aircraft matched **by serial only**,
  batteries matched by pack serial, pilot from the linked controller. If either aircraft or pilot
  is unknown the session waits under **Needs review** on the Live page.
- Flights carry a dedupe key, so a later log import of the same flight is caught.

## Security

- Every message-server connection and topic is approved by Certa: EMQX's HTTP authn/authz hooks
  call `POST /api/v1/live/mqtt/auth` and `/live/mqtt/acl` with header `x-certa-hook-secret`.
  A controller may only publish under its own serial and the aircraft linked to it; it can read
  only its own replies. The bridge account is the only superuser.
- Unlinking soft-deletes the device; its credential stops working immediately.
- Tables `live_devices`, `live_sessions`, `live_samples` are under row-level security. Cross-org
  lookups (serial → org, credential prefix → org) go through `SECURITY DEFINER` functions.

## EMQX configuration (sketch)

```
authentication = [{ mechanism = password_based, backend = http, method = post,
  url = "https://<api>/api/v1/live/mqtt/auth",
  headers { "content-type" = "application/json", "x-certa-hook-secret" = "${LIVE_HOOK_SECRET}" },
  body { clientid = "${clientid}", username = "${username}", password = "${password}" } }]
authorization { no_match = deny, sources = [{ type = http, method = post,
  url = "https://<api>/api/v1/live/mqtt/acl",
  headers { "content-type" = "application/json", "x-certa-hook-secret" = "${LIVE_HOOK_SECRET}" },
  body { clientid = "${clientid}", username = "${username}", topic = "${topic}", action = "${action}" } }] }
```

Expose MQTT over TLS (8883) and/or WSS (8084) for controllers; keep 1883 private for the worker.

## What's needed to turn it on

1. **DJI developer registration** (developer.dji.com): a Cloud API app for Arkhon gives
   `DJI_APP_ID`, `DJI_APP_KEY`, `DJI_APP_LICENSE`.
2. **A message-server host** reachable by controllers over MQTT/TLS or WSS. Cloudflare Containers
   only serve HTTP, so EMQX likely needs its own small VM (or EMQX Cloud). Set
   `LIVE_MQTT_URL`, `LIVE_MQTT_PUBLIC_URL`, `LIVE_MQTT_PASSWORD`, `LIVE_HOOK_SECRET`.
3. **An on-device test** with a real Pilot 2 controller. The JSBridge calls and OSD field names
   follow DJI's Cloud API documentation and are covered by a simulated controller in
   `apps/api/test/live-bridge.test.ts`, but have not yet run against real hardware.

Without these, the Live page still works for API-key bridges and shows DJI linking as "not
switched on".
