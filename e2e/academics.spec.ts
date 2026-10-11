import { expect, PEOPLE, test } from './fixtures';

test('a student lands on Home with their term and semester', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await expect(hira.getByRole('heading', { level: 1, name: /Hira/ })).toBeVisible();
  await expect(hira.getByText(/Fall 2026 · Semester 7/)).toBeVisible();
  await expect(hira.getByRole('heading', { name: 'Unread chats' })).toBeVisible();
});

test('Home shows the next class from the timetable', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await expect(hira.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(hira.getByText(/Next class|Now/).first()).toBeVisible();
});

test('a teacher cancels a class and the student sees it live', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);
  for (const page of [imran, hira]) {
    await page.goto('/academics/timetable');
    await page.getByRole('button', { name: 'Next week' }).click();
  }
  const awt = /^CSC337 Advanced Web Technologies · BCS-7A/;
  await imran.getByRole('button', { name: awt }).first().click();
  const dialog = imran.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel class' }).click();
  await dialog.getByLabel('Reason (optional)').fill('Department meeting');
  await dialog.getByRole('button', { name: 'Cancel this class' }).click();

  await expect(hira.getByRole('button', { name: /^CSC337 .*cancelled$/ })).toBeVisible();
  await expect(hira.getByRole('button', { name: /Notifications \(1 unread\)/ })).toBeVisible();

  // Undo, so other tests see the normal week.
  await imran.getByRole('button', { name: /^CSC337 .*cancelled$/ }).click();
  await imran.getByRole('dialog').getByRole('button', { name: 'Undo change' }).click();
  await expect(hira.getByRole('button', { name: /^CSC337 .*cancelled$/ })).toHaveCount(0);
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
