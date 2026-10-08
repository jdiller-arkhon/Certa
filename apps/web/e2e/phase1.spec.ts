import { expect, test } from '@playwright/test';

test('sign up, see the compliance notice, and review the US rule pack in admin', async ({ page }) => {
  const email = `pilot-${Date.now()}@example.com`;
  await page.goto('/sign-up');
  await page.waitForLoadState('networkidle'); // controlled inputs must hydrate before typing
  await page.getByLabel('Your name').fill('Dana Reyes');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByLabel('Organization name').fill('Reyes Aerial Imaging');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByTestId('org-name')).toHaveText('Reyes Aerial Imaging');
  await expect(page.getByTestId('compliance-notice')).toContainText('record-keeping tool');
  await expect(page.getByTestId('today-empty')).toBeVisible();

  await page.getByRole('link', { name: 'Rule pack' }).click();
  await expect(page).toHaveURL(/\/admin\/rules$/);
  await expect(page.getByTestId('rule-pack-header')).toContainText('US-FAA-Part107');
  await expect(page.getByTestId('unverified-count')).toContainText(/(\d+) of \1 values pending verification/);
  const altitude = page.locator('tr[data-rule-id="operation.max_altitude_agl"]');
  await expect(altitude).toContainText('400 ft');
  await expect(altitude).toContainText('14 CFR 107.51(b)');
  await expect(altitude).toContainText('Needs verification');

  // Owner overrides a value; the change shows with its reason and lands in the audit log.
  await altitude.getByRole('button', { name: 'Override' }).click();
  await page.getByLabel('Override value for operation.max_altitude_agl').fill('91.44');
  await page.getByLabel('Override reason for operation.max_altitude_agl').fill('Company SOP caps altitude at 300 ft');
  await page.getByRole('button', { name: 'Save override' }).click();
  await expect(altitude).toContainText('300 ft');
  await expect(altitude).toContainText('Company SOP caps altitude at 300 ft');

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByTestId('audit-events')).toContainText('Rule override');
  await expect(page.getByTestId('audit-events')).toContainText('Dana Reyes');
});

test('signed-out visitors are sent to sign in, and sign in with a password works', async ({ page, request }) => {
  const email = `signin-${Date.now()}@example.com`;
  const res = await request.post('/api/v1/signup', {
    data: { name: 'Sam Patel', email, password: 'correct-horse-battery', organizationName: 'Patel Mapping', timezone: 'America/Chicago' },
    headers: { origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' },
  });
  expect(res.status()).toBe(201);

  await page.goto('/admin/rules');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('org-name')).toHaveText('Patel Mapping');
});
