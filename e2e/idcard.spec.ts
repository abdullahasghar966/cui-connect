import { expect, PEOPLE, test } from './fixtures';

const AFFAIRS = 'student.affairs@comsats.edu.pk';

test('anyone can check an ID card by its QR; a replaced card stops verifying', async ({
  browser,
  person,
}) => {
  const usman = await person(PEOPLE.usman);
  await usman.goto('/me/id-card');
  await expect(usman.getByRole('heading', { level: 1, name: 'ID card' })).toBeVisible();
  await expect(usman.getByRole('figure', { name: 'ID card of Usman Tariq' })).toBeVisible();
  await expect(usman.getByText('Card 1 · issued')).toBeVisible();
  const oldPath = await usman.getByTestId('id-card').getAttribute('data-verify-path');
  expect(oldPath).toMatch(/^\/verify\/[\w-]{24}$/);

  // A guard scans it on their own phone, not signed in.
  const guardContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guard = await guardContext.newPage();
  await guard.goto(oldPath ?? '');
  await expect(guard.getByRole('status')).toContainText('Valid card');
  await expect(guard.getByText('Usman Tariq', { exact: true })).toBeVisible();
  await expect(guard.getByText('FA23-BCS-031', { exact: true })).toBeVisible();
  await expect(guard.getByText(/@/)).toHaveCount(0);

  // He lost it: Student Affairs mark his request ready, which issues a new card.
  const affairs = await person(AFFAIRS);
  await affairs.goto('/services/inbox');
  await affairs
    .getByRole('link')
    .filter({ hasText: 'Usman Tariq' })
    .filter({ hasText: 'ID card' })
    .first()
    .click();
  await affairs.getByRole('button', { name: 'Mark ready to collect' }).click();

  // His card page updates live with the new card.
  await expect(usman.getByText('Card 2 · issued')).toBeVisible();
  const newPath = await usman.getByTestId('id-card').getAttribute('data-verify-path');
  expect(newPath).not.toBe(oldPath);

  await guard.reload();
  await expect(guard.getByRole('status')).toContainText('Not a valid card');
  await expect(guard.getByText('Usman Tariq')).toHaveCount(0);
  await guard.goto(newPath ?? '');
  await expect(guard.getByRole('status')).toContainText('Valid card');
  await expect(guard.getByText(/earlier cards of this person no longer verify/)).toBeVisible();
  await guardContext.close();
});
