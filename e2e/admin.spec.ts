import { conversation, expect, goToChats, PEOPLE, test } from './fixtures';

test('an admin enrolls a student from another section and the course appears live', async ({
  person,
}) => {
  const admin = await person(PEOPLE.admin);
  const mehwish = await person(PEOPLE.mehwish); // BEE-7A student
  await goToChats(mehwish);
  await expect(conversation(mehwish, 'Advanced Web Technologies · BCS-7A')).toHaveCount(0);

  await admin.goto('/admin/structure');
  await admin.getByRole('button', { name: /students of CSC337 BCS-7A/ }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Find a student to enroll').fill(PEOPLE.mehwish);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Mehwish Akram' })
    .getByRole('button', { name: 'Enroll' })
    .click();
  await expect(dialog.getByText('Repeater', { exact: true })).toBeVisible();

  await expect(conversation(mehwish, 'Advanced Web Technologies · BCS-7A')).toBeVisible();

  await dialog.getByRole('button', { name: 'Remove Mehwish Akram from the course' }).click();
  await expect(conversation(mehwish, 'Advanced Web Technologies · BCS-7A')).toHaveCount(0);
});

test('moving a student to another section swaps their class group live', async ({ person }) => {
  const admin = await person(PEOPLE.admin);
  const maryam = await person('FA23-BCS-006'); // BCS-7A
  await goToChats(maryam);
  await expect(conversation(maryam, 'BCS-7A Class')).toBeVisible();

  await admin.goto('/admin/users');
  await admin.getByLabel('Search users').fill('FA23-BCS-006');
  await expect(admin.getByText('1 person')).toBeVisible();
  await admin.getByRole('button', { name: 'Actions for Maryam Shah' }).click();
  await admin.getByRole('menuitem', { name: 'Edit details' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Edit Maryam Shah' });
  await dialog.getByLabel('Section').selectOption({ label: 'BCS-7B (CS)' });
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(conversation(maryam, 'BCS-7B Class')).toBeVisible();
  await expect(conversation(maryam, 'BCS-7A Class')).toHaveCount(0);
});
