import type { Page } from '@playwright/test';

/** Pages that live in a top-bar menu rather than as a top-level link. */
const GROUP: Record<string, string> = {
  Pilots: 'Fleet',
  Aircraft: 'Fleet',
  Batteries: 'Fleet',
  Maintenance: 'Upkeep',
  Insurance: 'Upkeep',
  'Rule pack': 'Admin',
  Members: 'Admin',
  Integrations: 'Admin',
  'Audit log': 'Admin',
  Settings: 'Admin',
};

/** Navigates through the top bar the way a person would: open the menu if the page is in one. */
export async function go(page: Page, name: string) {
  const bar = page.getByRole('banner').first();
  const group = GROUP[name];
  if (group) await bar.getByRole('button', { name: group, exact: true }).click();
  const scope = group ? page : bar;
  await scope.getByRole('link', { name, exact: true }).filter({ visible: true }).first().click();
}
