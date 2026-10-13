import { expect, PEOPLE, test } from './fixtures';

const ROUTE = 'Route 1: Rawalpindi Saddar';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student follows a route from their stop and hears about a delay live', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const admin = await person(PEOPLE.admin);

  await hira.goto('/campus/transport');
  await hira.getByLabel(`Your stop on ${ROUTE}`).selectOption('Faizabad');
  await hira.getByRole('button', { name: 'Follow from this stop' }).first().click();
  await expect(toast(hira, `Following ${ROUTE} from Faizabad`)).toBeVisible();
  const next = hira
    .locator('section')
    .filter({ has: hira.getByRole('heading', { name: 'Your next bus' }) });
  await expect(next.getByText(`${ROUTE} · Faizabad`)).toBeVisible();
  await expect(next.getByText(/^(Next pick-up|Evening run): /)).toBeVisible();

  await admin.goto('/campus/transport');
  await admin.getByRole('button', { name: `Actions for ${ROUTE}` }).click();
  await admin.getByRole('menuitem', { name: 'Post a notice for today' }).click();
  await admin.getByLabel("What's happening?").fill('Running 15 minutes late');
  await admin.getByRole('button', { name: 'Send notice' }).click();

  await expect(toast(hira, `${ROUTE}: Running 15 minutes late`)).toBeVisible();
  await expect(hira.getByText('Today: Running 15 minutes late')).toBeVisible();
});
