import { expect, PEOPLE, test } from './fixtures';

const AFFAIRS = 'student.affairs@comsats.edu.pk';
const ZAINAB = 'FA23-BCS-004';
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('Student Affairs post a job; a BCS student is told live and saves it', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const affairs = await person(AFFAIRS);

  await affairs.goto('/campus/jobs');
  await affairs.getByRole('button', { name: 'Post a job' }).click();
  const dialog = affairs.getByRole('dialog');
  await dialog.getByLabel('Role', { exact: true }).fill('Cloud Support Intern');
  await dialog.getByLabel('Company').fill('Kahuta Cloud');
  await dialog.getByLabel('Where', { exact: true }).fill('Islamabad, hybrid');
  await dialog.getByLabel('Apply link').fill('https://careers.example.com/kahuta/cloud');
  await dialog.getByLabel('For programmes').fill('BCS');
  await dialog.getByLabel('About the role').fill('Help run Linux servers and Kubernetes clusters.');
  await dialog.getByRole('button', { name: 'Post job' }).click();
  await expect(toast(affairs, /^Job posted/)).toBeVisible();

  await expect(toast(hira, 'New internship: Cloud Support Intern at Kahuta Cloud')).toBeVisible();
  await hira.goto('/campus/jobs');
  const post = hira.getByRole('listitem').filter({ hasText: 'Cloud Support Intern' });
  await expect(post.getByRole('link', { name: 'Apply' })).toHaveAttribute(
    'href',
    'https://careers.example.com/kahuta/cloud',
  );
  await post.getByRole('button', { name: 'Save Cloud Support Intern' }).click();
  await hira.getByRole('tab', { name: /Saved/ }).click();
  await expect(
    hira.getByRole('listitem').filter({ hasText: 'Cloud Support Intern' }),
  ).toBeVisible();
});

test('a found item with a photo goes back to its owner', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const zainab = await person(ZAINAB);

  await hira.goto('/campus/lost-found');
  await hira.getByRole('button', { name: 'Report an item' }).click();
  const dialog = hira.getByRole('dialog');
  await dialog.getByText('I found something').click();
  await dialog.getByLabel('What is it?').fill('Grey wool scarf');
  await dialog.getByLabel('Kind of thing').selectOption('clothing');
  await dialog.getByLabel('Where').fill('Bus stop near the main gate');
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'scarf.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(dialog.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(hira.getByRole('heading', { level: 1, name: 'Grey wool scarf' })).toBeVisible();
  await expect(hira.getByRole('img', { name: 'Grey wool scarf' })).toBeVisible();

  await zainab.goto('/campus/lost-found');
  await zainab.getByRole('link').filter({ hasText: 'Grey wool scarf' }).click();
  await zainab
    .getByLabel('How can you show it is yours?')
    .fill('It has a small burn mark on one end.');
  await zainab.getByRole('button', { name: 'This is mine' }).click();
  await expect(zainab.getByText('Your answer')).toBeVisible();

  await expect(toast(hira, 'Zainab Malik says the grey wool scarf is theirs')).toBeVisible();
  await hira.reload();
  await hira.getByRole('button', { name: 'Returned to Zainab Malik' }).click();
  await expect(toast(zainab, 'Your grey wool scarf: marked returned to you')).toBeVisible();
});
