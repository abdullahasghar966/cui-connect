import { expect, PEOPLE, test } from './fixtures';

const DIRECTOR = 'director.office@comsats.edu.pk';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student evaluates a course anonymously; the teacher sees results once it closes', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);
  const director = await person(DIRECTOR);

  await hira.goto('/academics/evaluation');
  await hira.getByRole('link', { name: 'Evaluate CSC337 Advanced Web Technologies' }).click();
  await expect(hira.getByRole('heading', { level: 1, name: /^CSC337 / })).toBeVisible();
  const send = hira.getByRole('button', { name: 'Send anonymously' });
  await expect(send).toBeDisabled();
  for (const question of await hira.getByRole('group').all()) {
    await question.getByText('Agree', { exact: true }).click();
  }
  await hira.getByLabel('What went well?').fill('The Socket.IO rooms lab made it click.');
  await send.click();
  await expect(toast(hira, 'Thank you. Your answers were saved without your name.')).toBeVisible();
  await expect(hira).toHaveURL(/\/academics\/evaluation$/);
  await expect(
    hira.getByRole('listitem').filter({ hasText: 'CSC337' }).getByText('Evaluated'),
  ).toBeVisible();

  // While open, the teacher sees only that results are hidden.
  await imran.goto('/academics/evaluation');
  await imran.getByRole('link', { name: 'Results for CSC337 BCS-7A' }).click();
  await expect(imran.getByText('Results are hidden for now')).toBeVisible();

  await director.goto('/academics/evaluation');
  await director.getByRole('button', { name: 'Close evaluation' }).click();
  await expect(toast(director, /^Evaluation is closed/)).toBeVisible();

  await expect(toast(imran, 'Your course evaluation results are ready')).toBeVisible();
  await imran.reload();
  await expect(imran.getByRole('heading', { name: 'Ratings' })).toBeVisible();
  await expect(imran.getByText('“The Socket.IO rooms lab made it click.”')).toBeVisible();
});
