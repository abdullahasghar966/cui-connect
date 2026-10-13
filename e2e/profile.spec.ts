import { expect, openConversation, PEOPLE, test } from './fixtures';

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const toast = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(text);

test('a student adds a profile photo and her class sees it next to her name', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/me');
  await expect(hira.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible();
  await expect(hira.getByText('FA23-BCS-002', { exact: true })).toBeVisible();
  await hira
    .getByLabel('Choose a profile photo')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(toast(hira, 'Photo updated')).toBeVisible();
  await expect(hira.getByRole('button', { name: 'Remove' })).toBeVisible();

  const imran = await person(PEOPLE.imran);
  await openConversation(imran, 'BCS-7A Class');
  await imran.getByRole('button', { name: /^Members \(/ }).click();
  const row = imran.getByRole('listitem').filter({ hasText: 'Hira Khan' }).first();
  await expect(row.locator('img[src^="/api/files/"]')).toBeVisible();
});
