import { expect, PEOPLE, test } from './fixtures';

const AFFAIRS = 'student.affairs@comsats.edu.pk';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student applies for leave; the batch advisor approves it and the student sees it live', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);

  await hira.goto('/services/requests');
  await hira.getByRole('button', { name: 'New request' }).click();
  const dialog = hira.getByRole('dialog');
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('I have a medical appointment in Rawalpindi both days.');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(hira.getByRole('heading', { level: 1, name: /^Leave / })).toBeVisible();
  await expect(hira.getByText('Dr. Imran Haider (batch advisor)', { exact: true })).toBeVisible();

  await expect(toast(imran, 'New leave application from Hira Khan')).toBeVisible();
  await imran.goto('/services/inbox');
  await imran
    .getByRole('link')
    .filter({ hasText: 'Hira Khan' })
    .filter({ hasText: 'Leave application' })
    .first()
    .click();
  await imran.getByLabel('Note to the student (optional)').fill('Approved. Take care.');
  await imran.getByRole('button', { name: 'Approve' }).click();

  await expect(toast(hira, 'Leave application: Approved')).toBeVisible();
  await expect(
    hira
      .getByRole('listitem')
      .filter({ hasText: /marked it/ })
      .getByText('Approved. Take care.'),
  ).toBeVisible();
  await expect(hira.getByText('Approved', { exact: true }).first()).toBeVisible();
});

test('a complaint reaches Student Affairs, who reply on its timeline', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const affairs = await person(AFFAIRS);

  await hira.goto('/services/complaints');
  await hira.getByRole('button', { name: 'New complaint' }).click();
  const dialog = hira.getByRole('dialog');
  await dialog.getByLabel('About').selectOption('it');
  await dialog.getByLabel('Subject').fill('Wi-Fi drops in the Academic Block');
  await dialog
    .getByLabel('What happened?')
    .fill('The Wi-Fi disconnects every few minutes on the second floor.');
  await dialog.getByRole('button', { name: 'Send complaint' }).click();
  await expect(
    hira.getByRole('heading', { level: 1, name: 'Wi-Fi drops in the Academic Block' }),
  ).toBeVisible();

  await affairs.goto('/services/inbox');
  await affairs.getByRole('link').filter({ hasText: 'Wi-Fi drops in the Academic Block' }).click();
  await affairs.getByRole('button', { name: 'Start working on it' }).click();
  await affairs.getByLabel('Reply').fill('IT Services are replacing the access point this week.');
  await affairs.getByRole('button', { name: 'Reply' }).click();

  await expect(toast(hira, /replied: Wi-Fi drops in the Academic Block/)).toBeVisible();
  await expect(
    // On the timeline (the toast repeats it).
    hira
      .getByRole('listitem')
      .filter({ hasText: /replied ·/ })
      .getByText('IT Services are replacing the access point this week.'),
  ).toBeVisible();
  await expect(hira.getByText('Being looked into').first()).toBeVisible();
});
