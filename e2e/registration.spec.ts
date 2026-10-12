import { expect, PEOPLE, test } from './fixtures';

const ZAINAB = 'FA23-BCS-004';
const HASSAN = 'FA23-BCS-005';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student sends a course plan and the batch advisor approves it live', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);

  await hira.goto('/academics/registration');
  await expect(hira.getByRole('heading', { level: 1, name: 'Course registration' })).toBeVisible();
  await hira.getByRole('button', { name: 'Add all for BCS-7A' }).click();
  const plan = hira.getByRole('list', { name: 'Courses in your plan' });
  await expect(plan.getByRole('listitem')).toHaveCount(3);
  await expect(
    hira.getByText(/^CSC499 needs CSC498, which you are taking this term/),
  ).toBeVisible();
  await hira.getByRole('button', { name: 'Send to my batch advisor' }).click();
  await expect(toast(hira, 'Sent to Dr. Imran Haider (batch advisor)')).toBeVisible();
  await expect(hira.getByText('Waiting for approval').first()).toBeVisible();

  await expect(toast(imran, 'Hira Khan sent a course plan for Spring 2027')).toBeVisible();
  await imran.goto('/academics/registration');
  await imran.getByRole('link').filter({ hasText: 'Hira Khan' }).click();
  await expect(
    imran.getByRole('heading', { level: 1, name: 'Hira Khan: Spring 2027 plan' }),
  ).toBeVisible();
  await imran.getByLabel('Note to the student').fill('Good plan. Start your FYP report early.');
  await imran.getByRole('button', { name: 'Approve' }).click();

  await expect(toast(hira, 'Course plan approved')).toBeVisible();
  await expect(hira.getByText(/^You're registered for Spring 2027\./)).toBeVisible();
});

test('seats count down live, and a course already passed is refused', async ({ person }) => {
  const zainab = await person(ZAINAB);
  const hassan = await person(HASSAN);
  await hassan.goto('/academics/registration');
  const fyp = hassan.getByRole('listitem').filter({ hasText: 'Final Year Project II' }).first();
  const before = await fyp.getByText(/ of 50 seats left$/).textContent();
  const left = Number(before?.split(' ')[0]);

  await zainab.goto('/academics/registration');
  await zainab.getByRole('tab', { name: /All courses/ }).click();
  await zainab.getByLabel('Search offers').fill('CSC356');
  await zainab.getByRole('button', { name: 'Add CSC356 (BSE-5A)' }).click();
  await expect(zainab.getByText('You have already passed CSC356.')).toBeVisible();
  await expect(zainab.getByRole('button', { name: 'Send to my batch advisor' })).toBeDisabled();
  await zainab.getByRole('button', { name: 'Remove CSC356 (BSE-5A)' }).first().click();

  await zainab.getByRole('tab', { name: /For BCS-7A/ }).click();
  await zainab.getByRole('button', { name: 'Add all for BCS-7A' }).click();
  await expect(
    zainab.getByRole('list', { name: 'Courses in your plan' }).getByRole('listitem'),
  ).toHaveCount(3);
  await zainab.getByRole('button', { name: 'Send to my batch advisor' }).click();
  await expect(toast(zainab, /^Sent to /)).toBeVisible();

  // Hassan's page moves without a reload.
  await expect(fyp.getByText(`${left - 1} of 50 seats left`)).toBeVisible();
});
