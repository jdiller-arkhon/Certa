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
  await expect(check).toContainText('Go');
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
  await expect(page.getByRole('region', { name: 'Pre-flight check', exact: true })).toContainText('Go');

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
  await expect(page.getByText('Revoked')).toBeVisible();
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
