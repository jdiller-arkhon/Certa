import { go } from './nav';
import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page, org: string) {
  await page.goto('sign-up');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Your name').fill('Maya Thornton');
  await page.getByLabel('Email').fill(`maya-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByLabel('Organization name').fill(org);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('org-name')).toHaveText(org);
}

test('fleet loop: pilot, credentials, aircraft, battery, flight with pre-flight check', async ({ page }) => {
  await signUp(page, 'Summit Inspection');

  // Signing up made the owner a pilot; add their certificate number.
  await go(page, 'Pilots');
  await page.getByRole('button', { name: 'Open Maya Thornton' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Remote pilot certificate number').fill('4760825');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Maya Thornton' })).toBeVisible();
  await expect(page.getByText('Certificate 4760825')).toBeVisible();

  // Without a certificate on file the pilot isn't current.
  await page.getByRole('tab', { name: /Credentials/ }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Type').selectOption({ label: 'Remote Pilot Certificate (Part 107)' });
  await page.getByLabel('Issued').fill('2024-03-01');
  await page.getByRole('button', { name: 'Add credential' }).click();
  await expect(page.getByRole('button', { name: 'Edit Remote Pilot Certificate (Part 107)' })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Type').selectOption({ label: 'Recurrent training (Part 107)' });
  await page.getByLabel('Issued').fill(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Add credential' }).click();
  await expect(page.getByRole('button', { name: 'Edit Recurrent training (Part 107)' })).toBeVisible();

  // Aircraft
  await go(page, 'Aircraft');
  await page.getByRole('button', { name: 'Add aircraft' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Make').fill('DJI');
  await page.getByLabel('Model').fill('Matrice 30T');
  await page.getByLabel('Serial number').fill('1581F5BKD225400');
  await page.getByLabel('Nickname').fill('Falcon 1');
  await page.getByLabel('FAA registration number').fill('FA3ABC1234');
  await page.getByLabel('Registration expires').fill(new Date(Date.now() + 700 * 864e5).toISOString().slice(0, 10));
  await page.getByLabel('Takeoff mass').fill('8.3');
  await page.getByRole('button', { name: 'Add aircraft' }).click();
  await expect(page.getByRole('heading', { name: 'Falcon 1' })).toBeVisible();
  await expect(page.getByText('8.3 lb')).toBeVisible();

  // Battery
  await go(page, 'Batteries');
  await page.getByRole('button', { name: 'Add battery' }).first().click();
  await page.getByLabel('Serial number').fill('TB30-0001');
  await page.getByLabel('Label').fill('M30 #1');
  await page.getByLabel('Fits').selectOption('Matrice 30T');
  await page.getByLabel('Retire at').fill('200');
  await page.getByRole('dialog').getByRole('button', { name: 'Add battery' }).click();
  await expect(page.getByText('M30 #1', { exact: true })).toBeVisible();

  // Log a flight: the pre-flight check is computed from records on file.
  await go(page, 'Flights');
  await page.getByRole('button', { name: 'Log a flight' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Aircraft').selectOption({ label: 'Falcon 1' });
  await page.getByRole('button', { name: /M30 #1/ }).click();
  await page.getByRole('button', { name: '20 min' }).click();
  await page.getByLabel('Location').fill('Henderson Solar Farm');
  await page.getByLabel('Max altitude').fill('220');
  const check = page.getByRole('region', { name: 'Pre-flight check', exact: true });
  // Records are all current, but this browser can't share a location, so conditions weren't
  // checked: that's a Caution, not a Go.
  await expect(check).toContainText('Caution');
  await expect(check).toContainText('ConditionsNot checked');
  await expect(check).toContainText('Battery · M30 #1');
  // Tick the standard pre-flight checklist; it's signed into the flight record.
  const list = page.getByRole('region', { name: 'Standard pre-flight' });
  for (const box of await list.getByRole('checkbox').all()) await box.check({ force: true });
  await expect(list).toContainText('12 of 12 required');
  await page.getByRole('main').getByRole('button', { name: 'Log flight' }).click();

  await expect(page).toHaveURL(/\/certa\/flights\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Henderson Solar Farm').first()).toBeVisible();
  await expect(page.getByText('220 ft')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pre-flight checklist' })).toContainText('Complete');
  await expect(page.getByRole('region', { name: 'Pre-flight check', exact: true })).toContainText('Caution');
  await expect(page.getByRole('region', { name: 'Pre-flight check', exact: true })).toContainText('Conditions (checked on device)');

  // Totals and battery cycles are derived server-side.
  await go(page, 'Batteries');
  await expect(page.getByRole('meter', { name: 'M30 #1 cycles' })).toHaveAttribute('aria-valuenow', '1');
  await go(page, 'Today');
  await expect(page.getByText('Everyone is legal to fly').first()).toBeVisible();
});

test('offline: a flight logged without signal syncs when the connection returns', async ({ page, context }) => {
  await signUp(page, 'Field Ops');
  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const org = me.memberships[0].orgId;
  const api = (path: string, data: object) => page.request.post(`${origin}/certa/api/v1/orgs/${org}${path}`, { data, headers: { origin } });
  expect((await api('/pilots', { displayName: 'Riley Fenwick' })).status()).toBe(201);
  expect((await api('/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SKX10-77' })).status()).toBe(201);
  await page.reload();

  await page.goto('flights/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Aircraft')).toHaveValue(/.+/);
  await context.setOffline(true);
  await page.getByRole('button', { name: '15 min' }).click();
  await page.getByLabel('Location').fill('Cherry Creek Bridge');
  await page.getByRole('main').getByRole('button', { name: 'Log flight' }).click();
  await expect(page.getByText('Flight saved on this device')).toBeVisible();
  await expect(page.getByRole('button', { name: /Offline/ }).first()).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'All synced' }).first()).toBeVisible({ timeout: 15_000 });
  const list = await (await page.request.get(`${origin}/certa/api/v1/orgs/${org}/flights`)).json();
  expect(list.items.map((f: { locationName: string }) => f.locationName)).toContain('Cherry Creek Bridge');
});

test('maintenance schedule and insurance policy feed readiness', async ({ page }) => {
  await signUp(page, 'Hangar Nine');
  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const org = me.memberships[0].orgId;
  const res = await page.request.post(`${origin}/certa/api/v1/orgs/${org}/aircraft`, { data: { nickname: 'Heron 9', make: 'Freefly', model: 'Alta X', serialNumber: 'FFX-9' }, headers: { origin } });
  expect(res.status()).toBe(201);
  await page.reload();

  await go(page, 'Maintenance');
  await page.getByRole('button', { name: 'Add schedule' }).first().click();
  await page.getByLabel('Name').fill('Motor inspection');
  await page.getByLabel('Every', { exact: true }).fill('25');
  await page.getByRole('dialog').getByRole('button', { name: 'Add schedule' }).click();
  await expect(page.getByText('Motor inspection')).toBeVisible();
  await expect(page.getByText('0 h of 25 h')).toBeVisible();

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Performed by').fill('Jordan Pike');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('History')).toBeVisible();
  await expect(page.getByText(/Jordan Pike/)).toBeVisible();

  await go(page, 'Insurance');
  await page.getByRole('button', { name: 'Add policy' }).first().click();
  await page.getByLabel('Carrier').fill('Skyward Aviation');
  await page.getByLabel('Policy number').fill('SAI-448812');
  await page.getByLabel('Effective').fill(new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10));
  await page.getByLabel('Expires').fill(new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Heron 9' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add policy' }).click();
  await expect(page.getByText('Skyward Aviation')).toBeVisible();
  await expect(page.getByText(/Expires in 1\d? days|Expires in \d days/).first()).toBeVisible();

  // Expiring insurance shows on Today.
  await go(page, 'Today');
  await expect(page.getByText('Insurance (Skyward Aviation)').first()).toBeVisible();
});

test('inspector packet: share a read-only link that works without an account', async ({ page, browser }) => {
  await signUp(page, 'Packet Air');
  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const org = me.memberships[0].orgId;
  const ac = await (await page.request.post(`${origin}/certa/api/v1/orgs/${org}/aircraft`, { data: { nickname: 'Osprey 3', make: 'DJI', model: 'Matrice 350 RTK', serialNumber: 'M350-1', registrationNumber: 'FA3OSP', registrationExpiresOn: '2028-01-01' }, headers: { origin } })).json();

  await page.goto(`aircraft/${ac.id}`);
  await page.getByRole('button', { name: 'Share with inspector' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = await page.getByLabel('Share link').inputValue();
  expect(url).toMatch(/\/certa\/share\/[A-Za-z0-9_-]{43}$/);

  // A stranger with the link: no cookies.
  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(url);
  await expect(g.getByRole('heading', { name: 'Osprey 3' })).toBeVisible();
  await expect(g.getByText('FA3OSP')).toBeVisible();
  await expect(g.getByText('Packet Air').first()).toBeVisible();
  const pdfHref = await g.getByRole('link', { name: 'Sealed PDF' }).getAttribute('href');
  const pdf = await g.request.get(new URL(pdfHref!, url).href);
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  // Revoked: the guest's link stops working.
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Share with inspector' }).click();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  await g.reload();
  await expect(g.getByRole('heading', { name: 'Link not available' })).toBeVisible();
  await guest.close();
});

test('integrations: an admin creates an API key and Argus verifies a pilot with it', async ({ page, playwright }) => {
  await signUp(page, 'Argus Customer');
  await go(page, 'Integrations');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByRole('button', { name: 'Create key' }).click();
  const key = await page.getByLabel('New API key').inputValue();
  expect(key).toMatch(/^ck_[0-9a-f]{12}_/);
  await expect(page.getByText('Never used')).toBeVisible();

  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const pilots = await (await page.request.get(`${origin}/certa/api/v1/orgs/${me.memberships[0].orgId}/fleet`)).json();
  const machine = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${key}` } });
  const res = await machine.get(`${origin}/certa/api/v1/verify/pilots/${pilots.pilots[0].id}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ subject: { type: 'pilot' }, legalToFly: false }); // no certificate on file yet
  await machine.dispose();
});

/** A one-triangle GLB 2.0 for upload tests. */
function tinyGlb(): Buffer {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  let js = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }] }));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len: number, type: number) => Buffer.from(new Uint32Array([len, type]).buffer);
  return Buffer.concat([h, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
}

test('3D model: upload a GLB for an aircraft and switch back to the generic model', async ({ page }) => {
  await signUp(page, 'Model Shop');
  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const org = me.memberships[0].orgId;
  const ac = await (await page.request.post(`${origin}/certa/api/v1/orgs/${org}/aircraft`, { data: { nickname: 'Heron 9', make: 'Freefly', model: 'Alta X', serialNumber: 'FFX-9' }, headers: { origin } })).json();
  await page.goto(`aircraft/${ac.id}#model`);
  await page.getByLabel('Upload 3D model').setInputFiles({ name: 'heron.glb', mimeType: 'model/gltf-binary', buffer: tinyGlb() });
  await expect(page.getByText('Replace model')).toBeVisible();
  expect((await page.request.get(`${origin}/certa/api/v1/orgs/${org}/aircraft/${ac.id}/model`)).status()).toBe(200);

  await page.getByLabel('Upload 3D model').setInputFiles({ name: 'bad.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('definitely not a model') });
  await expect(page.getByRole('alert').filter({ hasText: 'Not a GLB' })).toBeVisible();

  await page.getByRole('button', { name: 'Use generic model' }).click();
  await expect(page.getByText('Upload .glb')).toBeVisible();
});

test('discord: a pilot gets a link code, the bot redeems it, and the page shows the link', async ({ page, playwright }) => {
  await signUp(page, 'Discord Pilots');
  await page.goto('settings/discord');
  await page.getByRole('button', { name: 'Get code' }).click();
  const command = await page.locator('code').filter({ hasText: '/certa link code:' }).innerText();
  const code = command.split('code:')[1]!.trim();
  expect(code).toMatch(/^CERTA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const origin = new URL(page.url()).origin;
  const bot = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${process.env.E2E_DISCORD_BOT_TOKEN ?? 'e2e-discord-bot-token-e2e-discord-bot-token'}` } });
  const res = await bot.post(`${origin}/certa/api/v1/discord/link-codes/redeem`, { data: { code, discordUserId: '123456789012345678' } });
  expect(res.status()).toBe(200);
  // Single use.
  expect((await bot.post(`${origin}/certa/api/v1/discord/link-codes/redeem`, { data: { code, discordUserId: '123456789012345678' } })).status()).toBeGreaterThanOrEqual(400);
  await bot.dispose();

  await expect(page.getByText('Linked to Discord')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('switch', { name: /community leaderboard/ }).check({ force: true });
  await expect(page.getByRole('switch', { name: /community leaderboard/ })).toBeChecked();
  await page.getByRole('button', { name: 'Unlink' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unlink' }).click();
  await expect(page.getByRole('button', { name: 'Get code' })).toBeVisible();
});

test('missions: plan one, check readiness, log a flight from it, and see it under way', async ({ page }) => {
  await signUp(page, 'Mission Ops');
  await go(page, 'Aircraft');
  await page.getByRole('button', { name: 'Add aircraft' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Make').fill('DJI');
  await page.getByLabel('Model').fill('Matrice 30T');
  await page.getByLabel('Serial number').fill('1581F5BKD225401');
  await page.getByLabel('Nickname').fill('Falcon 2');
  await page.getByRole('button', { name: 'Add aircraft' }).click();
  await expect(page.getByRole('heading', { name: 'Falcon 2' })).toBeVisible();

  await go(page, 'Missions');
  await page.getByRole('button', { name: 'Plan mission' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Name', { exact: true }).fill('Substation thermal survey');
  const at = (h: number) => {
    const d = new Date(Date.now() + 2 * 864e5);
    d.setHours(h, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00`;
  };
  await page.getByLabel('Starts').fill(at(9));
  await page.getByLabel('Ends').fill(at(11));
  await page.getByLabel('Max altitude').fill('200');
  await page.getByLabel('Location name').fill('Henderson substation');
  await page.getByLabel('Latitude').fill('39.9208');
  await page.getByLabel('Longitude').fill('-104.8586');
  const pic = page.getByLabel('Pilot in command');
  await pic.selectOption((await pic.locator('option', { hasText: 'Maya Thornton' }).getAttribute('value'))!);
  await page.getByRole('button', { name: /^Falcon 2/ }).click();
  await page.getByRole('button', { name: 'Plan mission' }).click();

  await expect(page).toHaveURL(/\/certa\/missions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Substation thermal survey' })).toBeVisible();
  const readiness = page.getByRole('region', { name: 'Mission readiness' });
  await expect(readiness).toContainText('Pilot in command · Maya Thornton');
  await expect(readiness).toContainText('Aircraft · Falcon 2');
  await expect(page.getByText('200 ft AGL').first()).toBeVisible();

  // Logging from the mission fills the form from the plan and links the flight back.
  await page.getByRole('main').getByRole('button', { name: 'Log flight' }).click();
  await expect(page.getByText('Mission · Substation thermal survey')).toBeVisible();
  await expect(page.getByLabel('Aircraft')).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByLabel('Location')).toHaveValue('Henderson substation');
  await page.getByRole('button', { name: '20 min' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Log flight' }).click();
  await expect(page).toHaveURL(/\/certa\/flights\/[0-9a-f-]{36}$/);

  await go(page, 'Missions');
  await page.getByRole('button', { name: 'Open Substation thermal survey' }).click();
  await expect(page.getByText('Mission · In progress')).toBeVisible();
  await expect(page.getByText('Henderson substation').first()).toBeVisible();
  await expect(page.getByRole('main').getByText('20m 00s').first()).toBeVisible();
});

test('prior experience: a pilot adds totals from another app and they count toward all-time totals', async ({ page }) => {
  await signUp(page, 'Ridge Line Aerial');
  await go(page, 'Pilots');
  await page.getByRole('button', { name: 'Open Maya Thornton' }).click();
  await expect(page.getByRole('heading', { name: 'Maya Thornton' })).toBeVisible();

  await page.getByRole('tab', { name: /Prior experience/ }).click();
  await expect(page.getByText(/Flying before Certa\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('App or logbook').fill('DJI Fly');
  await page.getByLabel('Flights', { exact: true }).fill('142');
  await page.getByLabel('Missions').fill('18');
  await page.getByLabel('Flight time · hours').fill('37');
  await page.getByLabel('Minutes').fill('45');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Edit DJI Fly' })).toContainText('142 flights · 18 missions · 37h 45m');

  // Edit it, then check the overview totals include it.
  await page.getByRole('button', { name: 'Edit DJI Fly' }).click();
  await page.getByLabel('Flights', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit DJI Fly' })).toContainText('150 flights');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByText('Includes 150 flights, 18 missions and 37h 45m from other apps.')).toBeVisible();

  // Removing it takes the totals back to Certa-logged flights only.
  await page.getByRole('tab', { name: /Prior experience/ }).click();
  await page.getByRole('button', { name: 'Edit DJI Fly' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(/Flying before Certa\?/)).toBeVisible();
});

test('Argus mission flights count toward flight time, then become flights when the pilot picks the drone', async ({ page, playwright }) => {
  const email = `argus-${Date.now()}@example.com`;
  await page.goto('sign-up');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Your name').fill('Maya Thornton');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByLabel('Organization name').fill('Mesa Survey');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('org-name')).toHaveText('Mesa Survey');

  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  await page.request.post(`${origin}/certa/api/v1/orgs/${me.memberships[0].orgId}/aircraft`, { data: { nickname: 'Kestrel', make: 'DJI', model: 'Mavic 3E', serialNumber: 'M3E-ARG' }, headers: { origin } });

  // Argus reports a job the pilot marked landed.
  const argus = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${process.env.E2E_ARGUS_INGEST_TOKEN ?? 'e2e-argus-ingest-token-e2e-argus-ingest-token'}` } });
  const takeoff = new Date(Date.now() - 2 * 3600_000);
  const res = await argus.post(`${origin}/certa/api/v1/integrations/argus/flights`, {
    data: { pilot: { arkhonUserId: `ark-${Date.now()}`, name: 'Maya Thornton', email }, jobId: `job-${Date.now()}`, reference: 'Argus job #1042', takeoffAt: takeoff.toISOString(), landingAt: new Date(takeoff.getTime() + 25 * 60_000).toISOString(), locationName: 'Grand Junction, CO' },
  });
  expect(res.status(), await res.text()).toBe(201);
  await argus.dispose();

  // Argus pushes in the background; the pilot sees it the next time Certa loads their fleet.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await go(page, 'Pilots');
  await page.getByRole('button', { name: 'Open Maya Thornton' }).click();
  await expect(page.getByText(/^Includes 1 Argus mission flight \(25m( 00s)?\) waiting for the drone./)).toBeVisible();
  await page.getByRole('button', { name: 'Pick drones' }).click();
  await page.getByRole('button', { name: 'Pick the drone for Argus job #1042' }).click();
  await page.getByLabel('Drone', { exact: true }).selectOption({ label: 'Kestrel' });
  await page.getByRole('button', { name: 'Add to logbook' }).click();
  await expect(page.getByRole('button', { name: 'Pick the drone for Argus job #1042' })).toHaveCount(0);
  await expect(page.getByText('Kestrel · Grand Junction, CO')).toBeVisible();
});

test('first run: getting started ticks off, help explains the jargon', async ({ page }) => {
  await signUp(page, 'First Flight Co');

  // A new pilot gets the checklist on Today, with the first open step highlighted.
  const checklist = page.getByRole('region', { name: 'Getting started' });
  await expect(checklist).toContainText('0 of 4 done');
  await checklist.getByRole('button', { name: /Add your drone/ }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Make').fill('DJI');
  await page.getByLabel('Model').fill('Mini 4 Pro');
  await page.getByLabel('Serial number').fill('1581F6Z0001');
  await page.getByRole('button', { name: 'Add aircraft' }).click();
  await expect(page.getByRole('heading', { name: /Mini 4 Pro/ })).toBeVisible();
  await go(page, 'Today');
  await expect(page.getByRole('region', { name: 'Getting started' })).toContainText('1 of 4 done');

  // Jargon on Log a flight explains itself.
  await page.goto('flights/new');
  await page.getByRole('button', { name: 'Pilot in command' }).click();
  await expect(page.getByRole('tooltip')).toContainText('responsible for the flight');

  // Help is in the account menu, and the glossary is searchable.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Help and guide' }).click();
  await expect(page.getByRole('heading', { name: 'How Certa works' })).toBeVisible();
  await page.getByLabel('Search the glossary').fill('laanc');
  await expect(page.locator('dt')).toHaveText(['Controlled airspace', 'LAANC']);
});

test('flight mode: two sorties with a battery swap and a marker become two logged flights', async ({ page }) => {
  await signUp(page, 'Field Ops');
  await go(page, 'Aircraft');
  await page.getByRole('button', { name: 'Add aircraft' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Make').fill('DJI');
  await page.getByLabel('Model').fill('Matrice 30T');
  await page.getByLabel('Serial number').fill('1581F5BKD225499');
  await page.getByLabel('Nickname').fill('Falcon 9');
  await page.getByRole('button', { name: 'Add aircraft' }).click();
  await expect(page.getByRole('heading', { name: 'Falcon 9' })).toBeVisible();
  for (const label of ['M30 #1', 'M30 #2']) {
    await go(page, 'Batteries');
    await page.getByRole('button', { name: 'Add battery' }).first().click();
    await page.getByLabel('Serial number').fill(`TB30-${label.slice(-1)}99`);
    await page.getByLabel('Label').fill(label);
    await page.getByRole('dialog').getByRole('button', { name: 'Add battery' }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // Start from Log a flight.
  await go(page, 'Flights');
  await page.getByRole('button', { name: 'Log a flight' }).click();
  await page.getByRole('button', { name: 'Flight mode' }).click();
  await expect(page.getByRole('heading', { name: 'Start on site' })).toBeVisible();
  await page.getByLabel('Aircraft').selectOption({ index: 1 });
  await page.getByRole('button', { name: /^M30 #1/ }).click();
  await page.getByRole('button', { name: /^M30 #2/ }).click();
  await page.getByLabel('Site').fill('Henderson Solar Farm');
  await page.getByRole('button', { name: 'Start flight mode' }).click();

  await expect(page.getByRole('heading', { name: 'Henderson Solar Farm' })).toBeVisible();

  // The emergency card is one tap away.
  await page.getByRole('button', { name: 'Emergency' }).click();
  await expect(page.getByRole('dialog', { name: 'Emergency' })).toContainText('14 CFR 107.9');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Emergency' })).toBeHidden();

  // A fake clock from here so sorties have real lengths; the session survives the reload.
  await page.clock.install();
  await page.reload();
  await page.getByRole('button', { name: 'Take off' }).click();
  await page.clock.fastForward('06:00');
  await expect(page.getByTestId('fm-timer')).toHaveText('6:00');
  await expect(page.getByText(/Land by · 14:00 left/)).toBeVisible();
  await page.getByRole('button', { name: 'Manned aircraft' }).click();
  await expect(page.getByText('Marked: Manned aircraft')).toBeVisible();
  await page.clock.fastForward('09:00');
  await page.getByRole('button', { name: 'Landed' }).click();
  await page.getByRole('group', { name: 'Battery left after landing' }).getByRole('button', { name: '40%' }).click();

  // The rested battery is picked for the next takeoff. A reload keeps the session.
  await expect(page.getByRole('button', { name: /^M30 #2/ })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByText('15:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take off' }).click();
  await page.clock.fastForward('12:00');
  await expect(page.getByRole('button', { name: /Finish/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Landed' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();

  await page.getByRole('button', { name: 'Finish and log 2 flights' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log flights' }).click();
  await expect(page).toHaveURL(/\/flights$/);
  await page.clock.runFor(2000);
  await expect(page.getByText('Henderson Solar Farm')).toHaveCount(2);
  await page.getByText('Henderson Solar Farm').last().click();
  await expect(page.getByText('Sortie 1 of 2, logged with flight mode.')).toBeVisible();
  await expect(page.getByText(/Manned aircraft/)).toBeVisible();
});

test('drone logs: a CSV log links to the aircraft by serial and the flight shows its data', async ({ page }) => {
  await signUp(page, 'Log Ops');
  await go(page, 'Aircraft');
  await page.getByRole('button', { name: 'Add aircraft' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Make').fill('DJI');
  await page.getByLabel('Model').fill('Mavic 3 Enterprise');
  await page.getByLabel('Serial number').fill('1581F5FHD23ABC');
  await page.getByLabel('Nickname').fill('Hawk 2');
  await page.getByRole('button', { name: 'Add aircraft' }).click();
  await expect(page.getByRole('heading', { name: 'Hawk 2' })).toBeVisible();

  // A 9-minute flight: climb to 60 m, 400 m out and back, with a wind warning and a tired cell.
  const t0 = Date.UTC(2026, 9, 20, 16, 0, 0);
  const lines = ['time(millisecond),datetime(utc),latitude,longitude,height_above_takeoff(feet),speed(mph),battery_percent,voltage(v),voltageCell1,voltageCell2,voltageCell3,voltageCell4,message,aircraft_sn'];
  for (let s = 0; s <= 600; s += 5) {
    const h = s < 30 ? 0 : s < 90 ? ((s - 30) / 60) * 60 : s < 510 ? 60 : s < 570 ? 60 - ((s - 510) / 60) * 60 : 0;
    const leg = s < 90 || s >= 510 ? 0 : s < 300 ? (s - 90) / 210 : 1 - (s - 300) / 210;
    const v = 4.2 - (s / 600) * 0.6;
    lines.push([s * 1000, new Date(t0 + s * 1000).toISOString().replace('T', ' ').slice(0, 19), (39.65 + leg * 0.0036).toFixed(7), '-104.85', (h / 0.3048).toFixed(1), (s >= 90 && s < 510 ? 4.26 : 0).toFixed(2), Math.round(98 - s / 10), (v * 4).toFixed(2), v.toFixed(3), v.toFixed(3), v.toFixed(3), (v - 0.15).toFixed(3), s === 300 ? 'Strong wind' : '', '1581F5FHD23ABC'].join(','));
  }
  await go(page, 'Flights');
  await page.goto('flights/import');
  await page.getByLabel('Flight log files').setInputFiles({ name: 'Oct-20th-2026-Airdata.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
  await expect(page.getByText('Linked by serial')).toBeVisible();
  await expect(page.getByText('AirData CSV')).toBeVisible();
  await expect(page.getByText('9m 00s')).toBeVisible();
  await expect(page.getByText('197 ft', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 flight' }).click();
  await expect(page.getByText('1 flight added to the logbook')).toBeVisible();

  // Importing the same log again is caught.
  await page.getByLabel('Flight log files').setInputFiles({ name: 'again.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
  await expect(page.getByText('This flight looks like it’s already in the logbook.')).toBeVisible();

  await go(page, 'Flights');
  await page.getByRole('cell', { name: 'Hawk 2' }).first().click();
  await expect(page.getByRole('heading', { name: 'Flight data' })).toBeVisible();
  await expect(page.getByText('From the aircraft’s log (AirData CSV)')).toBeVisible();
  await expect(page.getByText(/lowest cell 3\.4\d V/)).toBeVisible();
  await expect(page.getByText('Strong wind')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Flight track' })).toBeVisible();
});

test('live: a streaming drone shows in the air, then lands and is logged after review', async ({ page }) => {
  await signUp(page, 'Live Ops');
  const origin = new URL(page.url()).origin;
  const me = await (await page.request.get(`${origin}/certa/api/v1/me`)).json();
  const org = me.memberships[0].orgId;
  const post = (path: string, data: object) => page.request.post(`${origin}/certa/api/v1/orgs/${org}${path}`, { data, headers: { origin } });
  expect((await post('/aircraft', { nickname: 'Osprey 4', make: 'DJI', model: 'Matrice 30T', serialNumber: '1581F5BKD225D00' })).status()).toBe(201);
  await page.reload();
  const key = await (await post('/api-keys', { name: 'Bridge', scopes: ['live:write'] })).json();
  const send = (frames: object[]) =>
    page.request.post(`${origin}/certa/api/v1/integrations/live/frames`, { data: { model: 'DJI Matrice 30T', frames }, headers: { authorization: `Bearer ${key.key}` } });
  const frame = (t: number, airborne: boolean, i: number) => ({
    sn: '1581F5BKD225D00', t, lat: 39.65 + i * 0.00005, lon: -104.85, heightM: airborne ? 40 : 0, altM: null, speedMps: airborne ? 6 : 0, verticalSpeedMps: 0, headingDeg: 90,
    homeDistanceM: i * 5.5, batteryPct: 90 - i, remainingFlightSec: null, packs: [{ sn: null, pct: 90 - i, voltageV: 48.1, tempC: 31, cycles: null }], gpsSats: 22, windMps: 3, mode: 5, modeLabel: 'Manual', airborne,
  });
  const now = Date.now();
  expect((await send(Array.from({ length: 30 }, (_, i) => frame(now - 60_000 + i * 2000, i > 0, i)))).status()).toBe(202);

  await go(page, 'Live');
  await expect(page.getByRole('heading', { name: 'Live', level: 1 })).toBeVisible();
  const air = page.getByRole('region', { name: /In the air/ });
  await expect(air.getByText('Osprey 4')).toBeVisible();
  await expect(air.getByText(/Maya Thornton|Manual/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Live track' })).toBeVisible();

  // Landing: 25 s on the ground ends the flight. No pilot came with the frames, so it waits for review.
  expect((await send(Array.from({ length: 13 }, (_, i) => frame(now + 1000 + i * 2000, false, 30)))).status()).toBe(202);
  await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Pilot for Osprey 4').selectOption({ index: 1 });
  await page.getByRole('main').getByRole('button', { name: 'Log flight' }).click();
  await expect(page.getByRole('heading', { name: 'Logged automatically this week' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('region', { name: /Logged automatically/ }).getByRole('button', { name: /Osprey 4/ }).click();
  await expect(page.getByRole('heading', { name: 'Flight data' })).toBeVisible();
  await expect(page.getByText('From the aircraft’s log (DJI live link)')).toBeVisible();
});
