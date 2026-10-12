import { expect, PEOPLE, test } from './fixtures';

test('the campus map finds offices with their hours and rooms with what is on now', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/campus/map');
  await expect(hira.getByRole('heading', { level: 1, name: 'Campus map' })).toBeVisible();
  await expect(hira.getByRole('navigation', { name: 'Buildings' })).toContainText(
    'Academic Block I',
  );

  await hira.getByLabel('Find a place').fill('Accounts');
  const accounts = hira.getByRole('listitem').filter({ hasText: 'Accounts Office' });
  await expect(accounts).toContainText('Mon–Fri 9:00 AM–3:00 PM');
  await expect(accounts.getByText(/^(Open now|Closed)$/)).toBeVisible();
  await expect(hira.getByText('Central Library')).toBeHidden();

  await hira.getByLabel('Find a place').fill('A-101');
  await expect(
    hira
      .getByRole('listitem')
      .filter({ hasText: 'A-101' })
      .getByText(/^(Free|.* until )/),
  ).toBeVisible();
});

test('IT adds a place to the map', async ({ person }) => {
  const admin = await person(PEOPLE.admin);
  await admin.goto('/campus/map');
  await admin.getByRole('button', { name: 'Add a place' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Name').fill('University Bookshop');
  await dialog.getByLabel('Kind').selectOption('facility');
  await dialog.getByLabel('Building').fill('Student Service Centre');
  await dialog.getByLabel('Floor').fill('0');
  await dialog.getByRole('button', { name: 'Add place' }).click();
  await expect(
    admin.getByRole('region', { name: /Notifications/ }).getByText('University Bookshop saved'),
  ).toBeVisible();
  // The new row (the toast above also names it) shows the default office hours.
  await expect(
    admin
      .getByRole('listitem')
      .filter({ hasText: 'University Bookshop' })
      .filter({ hasText: 'Mon–Fri 8:30 AM–4:30 PM' }),
  ).toBeVisible();
});
