import { expect, PEOPLE, test } from './fixtures';

test('Ctrl+K finds a message and opens the chat at it', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.keyboard.press('Control+k');
  const box = hira.getByRole('combobox', { name: 'Search CUI Connect' });
  await box.fill('viva');
  const hit = hira.getByRole('option', { name: /short viva during the lab/ });
  await expect(hit).toBeVisible();
  // Courses and teachers come from the same box.
  await box.fill('compiler');
  await expect(hira.getByRole('option', { name: /CSC441 Compiler Construction/ })).toBeVisible();
  await box.fill('viva');
  await hira.getByRole('option', { name: /short viva during the lab/ }).click();

  await expect(hira).toHaveURL(/\/chat\/[a-f0-9]+$/);
  await expect(
    hira.getByRole('heading', { level: 1, name: 'Advanced Web Technologies · BCS-7A' }),
  ).toBeVisible();
  await expect(hira.getByText(/Yes, a short viva during the lab/)).toBeInViewport();
});

test('the teacher directory offers a message only where the rules allow', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/teachers');
  const teachers = hira.getByRole('list', { name: 'Teachers' });
  const imran = teachers.getByRole('listitem', { name: 'Dr. Imran Haider' });
  await expect(imran).toContainText('Faculty Block CS');
  await expect(
    teachers.getByRole('listitem', { name: /Sana Javed/ }).getByRole('button'),
  ).toHaveCount(0);
  await imran.getByRole('button', { name: 'Message' }).click();
  await expect(hira.getByRole('heading', { level: 1, name: 'Dr. Imran Haider' })).toBeVisible();
});
