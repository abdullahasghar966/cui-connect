import { expect, PEOPLE, test } from './fixtures';

const EXAM_OFFICE = 'exam.office@comsats.edu.pk';

test('the Exam Office publishes a paper and seats it; the student is told live', async ({
  person,
}) => {
  const office = await person(EXAM_OFFICE);
  const hira = await person(PEOPLE.hira);

  await hira.goto('/academics/exams');
  await expect(hira.getByRole('heading', { name: 'My exams' })).toBeVisible();
  const second = hira.getByRole('region', { name: 'Sessional II' });
  await expect(second.getByText('Your seat').first()).toBeVisible();
  await expect(hira.getByRole('region', { name: 'Terminal exam' })).toHaveCount(0);

  await office.goto('/academics/exams?kind=terminal');
  await office.getByRole('button', { name: 'Add paper' }).click();
  const dialog = office.getByRole('dialog');
  await dialog.getByLabel('Course').selectOption('CSC337');
  await dialog.getByLabel('Date').fill('2026-12-14');
  await dialog.getByLabel('Starts').fill('09:00');
  await dialog.getByLabel('Ends').fill('12:00');
  await dialog.getByLabel(/^A-101/).check();
  await expect(dialog.getByText(/12 students/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Add paper' }).click();
  await expect(office.getByRole('region', { name: 'Mon 14 Dec' })).toContainText('CSC337');

  await office.getByRole('button', { name: 'Publish date sheet' }).click();
  await expect(hira.getByText('The Terminal exam date sheet is out')).toBeVisible();
  await expect(hira.getByRole('region', { name: 'Terminal exam' })).toContainText('CSC337');

  await office.getByRole('button', { name: 'Options for CSC337' }).click();
  await office.getByRole('menuitem', { name: 'Assign seats' }).click();
  await expect(hira.getByText('Your seat for CSC337 Terminal exam')).toBeVisible();
  await expect(hira.getByRole('region', { name: 'Terminal exam' })).toContainText(
    /A-101 · R\d+ S\d+/,
  );

  // The printable chart mixes BCS-7A and BCS-7B.
  await office.getByRole('button', { name: 'Options for CSC337' }).click();
  await office.getByRole('menuitem', { name: 'Seating chart' }).click();
  await expect(
    office.getByRole('heading', { name: 'CSC337 Advanced Web Technologies' }),
  ).toBeVisible();
  await expect(office.getByRole('region', { name: 'A-101' })).toContainText('FA23-BCS-031');
});
