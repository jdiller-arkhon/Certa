import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const day = 864e5;

async function signUp(page: Page, email: string, name: string, org: string) {
  await page.goto('sign-up');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByLabel('Organization name').fill(org);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('org-name')).toHaveText(org);
}

test('a non-admin is kept out of the platform console', async ({ page }) => {
  await signUp(page, `pilot-${Date.now()}@example.com`, 'Pat Pilot', 'Pat’s Logbook');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Arkhon', exact: true })).toHaveCount(0);
  await page.goto('platform');
  await expect(page.getByRole('heading', { name: 'Arkhon admins only' })).toBeVisible();
});

test('platform console: find a pilot who needs a hand, remind them, export, announce', async ({ page }) => {
  const stamp = Date.now();
  await signUp(page, `platform-admin-${stamp}@example.com`, 'Olivia Owner', `Arkhon ${stamp}`);
  // The e2e server stores the Arkhon admin role on this account shortly after sign-up.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Arkhon', exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // A pilot whose recurrent training lapsed, with a flight.
  const me = await (await page.request.get('api/v1/me')).json();
  const orgId: string = me.memberships[0].orgId;
  const post = async (path: string, data: object) => {
    const r = await page.request.post(`api/v1/orgs/${orgId}${path}`, { data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const dana = (await post('/pilots', { displayName: 'Dana Reyes', email: `dana-${stamp}@example.com` })).id;
  await post(`/pilots/${dana}/credentials`, { credentialType: 'part107_certificate', issuedOn: '2023-01-10' });
  await post(`/pilots/${dana}/credentials`, { credentialType: 'part107_recurrent', issuedOn: '2023-01-10', expiresOn: new Date(Date.now() - 5 * day).toISOString().slice(0, 10) });
  const ac = (await post('/aircraft', { nickname: 'Falcon', make: 'DJI', model: 'M30T', serialNumber: `S${stamp}`, registrationNumber: 'FA3X', registrationExpiresOn: '2030-01-01' })).id;
  const t0 = Date.now() - 2 * day;
  await post('/flights', { pilotInCommandId: dana, aircraftId: ac, takeoffAt: new Date(t0).toISOString(), landingAt: new Date(t0 + 1800_000).toISOString(), localTimeZone: 'America/Denver' });

  // Overview → pilots who need a hand.
  await page.getByRole('banner').getByRole('button', { name: 'Arkhon', exact: true }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Flight hours by month, last 12 months' })).toBeVisible();
  await page.getByRole('button', { name: /Need a hand/ }).click();
  await expect(page.getByRole('heading', { name: 'All pilots' })).toBeVisible();
  await page.getByLabel('Search pilots').fill(`Arkhon ${stamp}`);
  const row = page.getByRole('row', { name: /Dana Reyes/ });
  await expect(row).toContainText('Recurrent training overdue');

  // CSV of the directory.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toContain('"Dana Reyes"');

  // The pilot's page: email a reminder with a note; it shows in their admin history.
  await page.getByRole('button', { name: 'Open Dana Reyes' }).click();
  await expect(page.getByRole('heading', { name: 'Dana Reyes' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('Recurrent training (Part 107)');
  await page.getByLabel('Email a reminder').fill('Please renew before Friday.');
  await page.getByRole('button', { name: 'Send reminder' }).click();
  await expect(page.getByText('Reminder sent to 1 pilot.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Admin history' })).toContainText('Reminder emailed by Olivia Owner');

  // An announcement shows as a banner for members.
  await page.goto('platform/announcements');
  await page.getByLabel('Title').fill(`Hangar closed ${stamp}`);
  await page.getByLabel('Message').fill('The hangar is closed Friday for maintenance.');
  await page.getByRole('button', { name: 'Post announcement' }).click();
  await expect(page.getByRole('region', { name: 'Posted' })).toContainText(`Hangar closed ${stamp}`);
  await page.goto('.');
  const banner = page.getByRole('complementary', { name: 'Announcement from Arkhon' });
  await expect(banner).toContainText(`Hangar closed ${stamp}`);
  await banner.getByRole('button', { name: /Dismiss/ }).click();
  await expect(banner).toHaveCount(0);

  // Everything above is in the admin activity log.
  await page.goto('platform/activity');
  await expect(page.getByRole('main')).toContainText(/emailed a reminder · Dana Reyes/i);
  await expect(page.getByRole('main')).toContainText(/downloaded an export · Pilot directory/i);
  await expect(page.getByRole('main')).toContainText(/posted an announcement/i);
});
