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

test('a student finds a course in the catalog and opens its chat', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/courses');
  await hira.getByLabel('Search courses').fill('web tech');
  const results = hira.getByRole('list', { name: 'Courses' });
  await expect(results.getByRole('link')).toHaveCount(2);
  await results.getByRole('link', { name: /CSC337/ }).click();

  await expect(
    hira.getByRole('heading', { level: 1, name: 'Advanced Web Technologies' }),
  ).toBeVisible();
  await expect(hira.getByText('3(2,1) credit hours')).toBeVisible();
  const sections = hira.getByRole('list', { name: 'Sections' }).locator(':scope > li');
  await expect(sections).toHaveCount(2);
  await expect(sections.first()).toContainText('Your section');
  // Prerequisites link to their own course page.
  await expect(hira.getByRole('link', { name: /CSC336 Web Technologies/ })).toBeVisible();

  await sections.first().getByRole('link', { name: 'Open chat' }).click();
  await expect(
    hira.getByRole('heading', { level: 1, name: /Advanced Web Technologies/ }),
  ).toBeVisible();
  await expect(hira).toHaveURL(/\/chat\//);
  // The other section's chat is not offered.
  await hira.goBack();
  await expect(sections.nth(1).getByRole('link', { name: 'Open chat' })).toHaveCount(0);
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
