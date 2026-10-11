import { expect, PEOPLE, test } from './fixtures';

test('a teacher publishes marks and the student is told live', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);

  await hira.goto('/academics/results');
  await expect(hira.getByText('CGPA', { exact: true })).toBeVisible();
  const awt = hira.getByRole('region', { name: 'CSC337 Advanced Web Technologies' });
  await awt.getByRole('button', { expanded: false }).click();
  await expect(awt.getByRole('list', { name: 'Marks' })).toContainText('Sessional I');
  await expect(awt.getByRole('list', { name: 'Marks' })).not.toContainText('Quiz 3');

  await imran.goto('/academics/results');
  await imran
    .getByRole('list', { name: 'Your courses' })
    .locator(':scope > li', { hasText: 'Advanced Web Technologies · BCS-7A' })
    .getByRole('link', { name: 'Open marks' })
    .click();
  const cell = imran.getByLabel('Quiz 3 for Hira Khan');
  await cell.fill('11');
  await expect(
    imran.getByText('Some marks are not valid numbers or are above the total.'),
  ).toBeVisible();
  await cell.fill('9.5');
  await imran.getByRole('button', { name: 'Save marks' }).click();
  await expect(imran.getByText('Marks saved')).toBeVisible();

  await imran.getByRole('button', { name: 'Options for Quiz 3' }).click();
  await imran.getByRole('menuitem', { name: 'Publish to students' }).click();

  // Hira gets a toast, and her open Results page refreshes by itself.
  await expect(hira.getByText('Advanced Web Technologies Quiz 3 marks are out')).toBeVisible();
  await expect(awt.getByRole('list', { name: 'Marks' })).toContainText('Quiz 3');
  await expect(awt.getByRole('listitem').filter({ hasText: 'Quiz 3' })).toContainText('9.5 / 10');
});
