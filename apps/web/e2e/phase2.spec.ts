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
  await page.getByRole('link', { name: 'Pilots' }).click();
  await page.getByRole('button', { name: 'Open Maya Thornton' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Remote pilot certificate number').fill('4760825');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Maya Thornton' })).toBeVisible();
  await expect(page.getByText('Certificate 4760825')).toBeVisible();

  // Without a certificate on file the pilot isn't current.
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
  await page.getByRole('link', { name: 'Aircraft' }).click();
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
  await page.getByRole('link', { name: 'Batteries' }).click();
  await page.getByRole('button', { name: 'Add battery' }).first().click();
  await page.getByLabel('Serial number').fill('TB30-0001');
  await page.getByLabel('Label').fill('M30 #1');
  await page.getByLabel('Fits').selectOption('Matrice 30T');
  await page.getByLabel('Retire at').fill('200');
  await page.getByRole('dialog').getByRole('button', { name: 'Add battery' }).click();
  await expect(page.getByText('M30 #1')).toBeVisible();

  // Log a flight: the pre-flight check is computed from records on file.
  await page.getByRole('link', { name: 'Flights' }).click();
  await page.getByRole('button', { name: 'Log a flight' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Aircraft').selectOption({ label: 'Falcon 1' });
  await page.getByRole('button', { name: /M30 #1/ }).click();
  await page.getByRole('button', { name: '20 min' }).click();
  await page.getByLabel('Location').fill('Henderson Solar Farm');
  await page.getByLabel('Max altitude').fill('220');
  const check = page.getByRole('region', { name: 'Pre-flight check' });
  await expect(check).toContainText('Go');
  await expect(check).toContainText('Battery · M30 #1');
  await page.getByRole('button', { name: 'Log flight' }).click();

  await expect(page).toHaveURL(/\/certa\/flights\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Henderson Solar Farm').first()).toBeVisible();
  await expect(page.getByText('220 ft')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pre-flight check' })).toContainText('Go');

  // Totals and battery cycles are derived server-side.
  await page.getByRole('link', { name: 'Batteries' }).click();
  await expect(page.getByRole('meter', { name: 'M30 #1 cycles' })).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('link', { name: 'Today' }).click();
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
  await page.getByRole('button', { name: 'Log flight' }).click();
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

  await page.getByRole('link', { name: 'Maintenance' }).click();
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

  await page.getByRole('link', { name: 'Insurance' }).click();
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
  await page.getByRole('link', { name: 'Today' }).click();
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
