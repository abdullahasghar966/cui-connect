import { expect, PEOPLE, test } from './fixtures';

const AFFAIRS = 'student.affairs@comsats.edu.pk';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student takes the last place at a contest; the next person sees it full, live', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const mehwish = await person(PEOPLE.mehwish);
  await hira.goto('/campus/events');
  await mehwish.goto('/campus/events');
  const card = (page: typeof hira) =>
    page.getByRole('listitem').filter({ hasText: 'ACM Speed Programming Contest' });
  await expect(card(mehwish).getByText(/1 place left/)).toBeVisible();

  await card(hira).getByRole('button', { name: 'Going to ACM Speed Programming Contest' }).click();
  await expect(
    card(hira).getByRole('button', { name: 'Going to ACM Speed Programming Contest' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Mehwish's page updates without a reload.
  await expect(card(mehwish).getByText(/12 going · .* full/)).toBeVisible();
  await expect(
    card(mehwish).getByRole('button', { name: 'Going to ACM Speed Programming Contest' }),
  ).toBeDisabled();
});

test('a student proposes an event; Student Affairs publish it', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const affairs = await person(AFFAIRS);

  await hira.goto('/campus/events');
  await hira.getByRole('button', { name: 'New event' }).click();
  const dialog = hira.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Hackathon Prep Session');
  await dialog.getByLabel('Kind').selectOption('workshop');
  await dialog.getByLabel('Organised by').fill('BCS-7A Class');
  await dialog.getByLabel('Where').fill('Lab A-104');
  await dialog
    .getByLabel('About the event')
    .fill('Forming teams and picking ideas for the hackathon.');
  await dialog.getByRole('button', { name: 'Send for approval' }).click();
  await expect(
    hira.getByRole('heading', { level: 1, name: 'Hackathon Prep Session' }),
  ).toBeVisible();
  await expect(hira.getByText('Waiting for Student Affairs')).toBeVisible();

  await expect(toast(affairs, 'Event to approve: Hackathon Prep Session')).toBeVisible();
  await affairs.goto('/campus/events?tab=waiting');
  await affairs.getByRole('link', { name: 'Hackathon Prep Session' }).click();
  await affairs.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(toast(affairs, 'Event published')).toBeVisible();

  await expect(toast(hira, 'Your event is published: Hackathon Prep Session')).toBeVisible();
});
