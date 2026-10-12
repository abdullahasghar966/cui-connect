import { expect, PEOPLE, test } from './fixtures';

const ACCOUNTS = 'accounts.office@comsats.edu.pk';
const AHMED = 'FA23-BCS-003';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('the Accounts Office records a payment and the student sees it live', async ({ person }) => {
  const usman = await person(PEOPLE.usman);
  const clerk = await person(ACCOUNTS);

  await usman.goto('/services/fees');
  await expect(usman.getByText(/^Rs [\d,]+ to pay$/)).toBeVisible();
  await expect(
    usman.getByRole('heading', { name: 'Fall 2026 · Second instalment', level: 2 }),
  ).toBeVisible();

  await clerk.goto('/services/fee-desk');
  await clerk.getByLabel('Search challans').fill('Usman');
  await clerk.getByRole('button', { name: 'Mark paid: Usman Tariq, second instalment' }).click();
  const dialog = clerk.getByRole('dialog');
  await dialog.getByLabel('Bank reference (optional)').fill('BR-990011');
  await dialog.getByRole('button', { name: 'Mark paid' }).click();
  await expect(toast(clerk, /^Usman Tariq: Rs 5[12],000 received$/)).toBeVisible();

  await expect(toast(usman, /^Fee received: Rs 5[12],000$/)).toBeVisible();
  await expect(usman.getByText('All paid', { exact: true })).toBeVisible();
  await expect(usman.getByText(/bank reference BR-990011/)).toBeVisible();
});

test('a challan issued by mistake is withdrawn, then issued again to the section', async ({
  person,
}) => {
  const ahmed = await person(AHMED);
  const clerk = await person(ACCOUNTS);
  await ahmed.goto('/services/fees');
  await expect(
    ahmed.getByRole('heading', { name: 'Fall 2026 · Second instalment', level: 2 }),
  ).toBeVisible();

  await clerk.goto('/services/fee-desk');
  await clerk.getByLabel('Search challans').fill(AHMED);
  await clerk.getByRole('button', { name: 'Actions for challan FA26-FA23BCS003-2' }).click();
  await clerk.getByRole('menuitem', { name: 'Withdraw challan' }).click();
  await clerk.getByRole('dialog').getByRole('button', { name: 'Withdraw challan' }).click();
  await expect(toast(ahmed, 'Fee challan withdrawn')).toBeVisible();
  await expect(
    ahmed.getByRole('heading', { name: 'Fall 2026 · Second instalment', level: 2 }),
  ).toBeHidden();

  // Issued again to all of BCS-7A: everyone else already has theirs, so only Ahmed gets one.
  await clerk.getByRole('button', { name: 'Issue challans' }).click();
  const dialog = clerk.getByRole('dialog');
  await dialog.getByLabel('Who').selectOption('section');
  await dialog.getByLabel('Section').selectOption({ label: 'BCS-7A' });
  await dialog.getByLabel('Challan', { exact: true }).selectOption('second');
  await expect(dialog.getByText('Rs 51,000', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Issue challans' }).click();
  await expect(toast(clerk, /^Issued 1 challan \(\d+ already had one\)$/)).toBeVisible();

  await expect(toast(ahmed, 'Fee challan: Fall 2026 second instalment')).toBeVisible();
  await expect(
    ahmed.getByRole('heading', { name: 'Fall 2026 · Second instalment', level: 2 }),
  ).toBeVisible();

  // The printable challan has the bank's, the Accounts Office's and the student's copies.
  await ahmed.evaluate(() => {
    // Keep the print layout on the page (a real print dialog would close it).
    window.print = () => {
      throw new Error('kept for the test');
    };
  });
  await ahmed.getByRole('button', { name: 'Print challan' }).first().click();
  await ahmed.emulateMedia({ media: 'print' });
  for (const copy of ['Bank copy', 'Accounts Office copy', 'Student copy']) {
    const region = ahmed.getByRole('region', { name: copy });
    await expect(region).toBeVisible();
    await expect(region.getByText('No. FA26-FA23BCS003-2')).toBeVisible();
    await expect(region.getByText('Fifty-one thousand rupees only')).toBeVisible();
  }
});
