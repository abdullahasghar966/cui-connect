import { expect, PEOPLE, test } from './fixtures';

test('a student lands on Home with their term and semester', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await expect(hira.getByRole('heading', { level: 1, name: /Hira/ })).toBeVisible();
  await expect(hira.getByText(/Fall 2026 · Semester 7/)).toBeVisible();
  await expect(hira.getByRole('heading', { name: 'Unread chats' })).toBeVisible();
});

test('IT sets up rooms and the course catalog', async ({ person }) => {
  const admin = await person(PEOPLE.admin);
  await admin.goto('/admin/academic?tab=rooms');
  await admin.getByRole('button', { name: 'Add room' }).first().click();
  const dialog = admin.getByRole('dialog', { name: 'Add a room' });
  await dialog.getByLabel('Name').fill('C-301');
  await dialog.getByLabel('Block').fill('Academic Block III');
  await dialog.getByLabel('Capacity').fill('48');
  await dialog.getByRole('button', { name: 'Add room' }).click();
  await expect(admin.getByRole('cell', { name: 'C-301', exact: true })).toBeVisible();

  await admin.getByRole('tab', { name: 'Course catalog' }).click();
  await admin.getByLabel('Search the catalog').fill('compiler');
  await expect(admin.getByText('Compiler Construction')).toBeVisible();
  await expect(admin.getByText('Advanced Web Technologies')).toHaveCount(0);
});
