import { expect, PEOPLE, test } from './fixtures';

const MOBILE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

test('a student hands in work; the teacher grades it and the student sees the grade live', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/coursework');
  await hira
    .getByRole('link', { name: /Assignment 2: REST API with Express/ })
    .first()
    .click();
  await expect(
    hira.getByRole('heading', { name: 'Assignment 2: REST API with Express' }),
  ).toBeVisible();

  await hira.getByLabel('Add files').setInputFiles({
    name: 'notice-board-api.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK fake zip for the test'),
  });
  await expect(hira.getByText('notice-board-api.zip')).toBeVisible();
  await hira.getByLabel('Answer or note (optional)').fill('All three routes work; see README.');
  await hira.getByRole('button', { name: 'Hand in' }).click();
  await expect(hira.getByText(/^Handed in /)).toBeVisible();

  const imran = await person(PEOPLE.imran);
  await imran.goto(hira.url());
  const row = imran.getByRole('row').filter({ hasText: 'Hira Khan' });
  await expect(row).toContainText('notice-board-api.zip');
  await imran.getByLabel('Mark for Hira Khan').fill('17');
  await imran.getByLabel('Comments for Hira Khan').fill('Good validation. Add pagination next.');
  await imran.getByRole('button', { name: 'Save grades' }).click();
  await expect(imran.getByText(/Grades saved/)).toBeVisible();
  await imran.getByRole('button', { name: 'Return grades' }).click();

  // Hira is told, and her page shows the grade and the comment without a reload.
  await expect(
    hira.getByText('Advanced Web Technologies Assignment 2: REST API with Express marks are out'),
  ).toBeVisible();
  await expect(hira.getByText('Good validation. Add pagination next.')).toBeVisible();
  await expect(hira.locator('p').filter({ hasText: /^17\/20$/ })).toBeVisible();
});

test('a teacher shares a link for this week and the class finds it', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);
  await imran.goto('/academics/coursework');
  await imran.getByRole('link', { name: /CSC337 · BCS-7A/ }).click();
  await imran.getByRole('button', { name: 'Add material' }).click();
  const dialog = imran.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Socket.IO emit cheat sheet');
  await dialog.getByLabel('Link to a web page').check();
  await dialog
    .getByLabel('Link', { exact: true })
    .fill('https://socket.io/docs/v4/emit-cheatsheet/');
  await dialog.getByRole('button', { name: 'Add material' }).click();
  await expect(imran.getByText('Material added')).toBeVisible();

  // A live toast (Home's notification list shows it too).
  await expect(
    hira
      .getByRole('region', { name: /Notifications/ })
      .getByText('New material in Advanced Web Technologies'),
  ).toBeVisible();
  await hira.goto(new URL(imran.url()).pathname);
  await hira.getByRole('tab', { name: /Materials/ }).click();
  await expect(hira.getByRole('link', { name: 'Socket.IO emit cheat sheet' })).toHaveAttribute(
    'href',
    'https://socket.io/docs/v4/emit-cheatsheet/',
  );
});

test('a teacher runs a live quiz; a student answers on their phone', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  await imran.goto('/academics/coursework');
  await imran.getByRole('link', { name: /CSC337 · BCS-7A/ }).click();
  await imran.getByRole('tab', { name: /Quizzes/ }).click();
  await imran.getByRole('link', { name: /Quick check: Socket\.IO rooms/ }).click();
  await imran.getByRole('button', { name: 'Start live quiz' }).click();

  const hira = await person(PEOPLE.hira, MOBILE);
  await hira.goto('/academics/coursework');
  await hira.getByRole('link', { name: 'Join now' }).click();
  await expect(hira.getByText("You're in.")).toBeVisible();
  await expect(imran.getByText(/1\s*student\s*joined/)).toBeVisible();

  await imran.getByRole('button', { name: 'Show the first question' }).click();
  await expect(hira.getByRole('timer')).toBeVisible();
  await hira.getByRole('button', { name: /socket\.to\(room\)\.emit/ }).click();
  await expect(hira.getByText(/You answered/)).toBeVisible();
  // The teacher's tally moves as soon as she answers.
  await expect(imran.getByText(/1\s*answered/)).toBeVisible();

  await imran.getByRole('button', { name: 'Show the answer' }).click();
  await expect(hira.getByText('Correct! +2')).toBeVisible();

  await imran.getByRole('button', { name: 'End quiz now' }).click();
  await expect(hira.getByText(/Quiz over/)).toBeVisible();
  await expect(imran.getByRole('heading', { name: 'Results' })).toBeVisible();
  await imran.getByRole('button', { name: 'Save as quiz marks' }).click();
  await expect(imran.getByRole('link', { name: 'Open the marks sheet' })).toBeVisible();
});
