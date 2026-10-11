import { expect, PEOPLE, test } from './fixtures';

test('a student plans a grade, reads the transcript and the degree plan', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/results');
  const awt = hira.getByRole('region', { name: 'CSC337 Advanced Web Technologies' });
  await awt.getByRole('button', { expanded: false }).click();
  const plan = awt.getByRole('region', { name: 'What do I need' });
  await expect(plan.getByText(/^A$/)).toBeVisible();
  await plan.getByRole('slider').fill('100');
  await expect(plan.getByText('100% on the rest')).toBeVisible();

  await hira
    .getByRole('navigation', { name: 'Records' })
    .getByRole('link', { name: 'Transcript' })
    .click();
  await expect(hira.getByRole('region', { name: 'Fall 2023' })).toBeVisible();
  await expect(hira.getByText('BS Computer Science', { exact: false }).first()).toBeVisible();

  await hira
    .getByRole('navigation', { name: 'Records' })
    .getByRole('link', { name: 'Degree progress' })
    .click();
  await expect(hira.getByRole('region', { name: 'Semester 7' })).toContainText('CSC337');
  await expect(
    hira.getByRole('region', { name: 'Semester 8' }).getByLabel('Still to take').first(),
  ).toBeVisible();
});

test('the Examination Office looks up a student transcript', async ({ person }) => {
  const office = await person('exam.office@comsats.edu.pk');
  await office.goto('/academics/transcript');
  await expect(office.getByText('Choose a student')).toBeVisible();
  await office.getByLabel('Find a student').fill('Ahmed');
  await office
    .getByRole('list', { name: 'Students' })
    .getByRole('button', { name: /Ahmed Nawaz/ })
    .click();
  await expect(office.getByRole('heading', { name: 'Ahmed Nawaz' })).toBeVisible();
  // His failed then retaken course appears in both terms.
  await expect(office.getByRole('region', { name: 'Fall 2024' })).toContainText('CSC211');
  await expect(office.getByRole('region', { name: 'Spring 2025' })).toContainText('CSC211');
});
