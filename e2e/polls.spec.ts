import { expect, openConversation, PEOPLE, test } from './fixtures';

const AWT = 'Advanced Web Technologies · BCS-7A';

test('a teacher posts a poll and votes update live for both people', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);
  await openConversation(imran, AWT);
  await openConversation(hira, AWT);

  await imran.getByRole('button', { name: 'Create poll' }).click();
  const dialog = imran.getByRole('dialog', { name: 'Create a poll' });
  await dialog.getByLabel('Question').fill('Which day suits the viva?');
  await dialog.getByLabel('Option 1', { exact: true }).fill('Monday');
  await dialog.getByLabel('Option 2', { exact: true }).fill('Tuesday');
  await dialog.getByRole('button', { name: 'Add option' }).click();
  await dialog.getByLabel('Option 3', { exact: true }).fill('Wednesday');
  await dialog.getByRole('button', { name: 'Post poll' }).click();

  const hiraPoll = hira.getByRole('region', { name: 'Poll: Which day suits the viva?' });
  await expect(hiraPoll).toBeVisible();
  await hiraPoll.getByRole('button', { name: /^Tuesday: / }).click();
  await expect(
    hiraPoll.getByRole('button', { name: /^Tuesday: 1 vote, your choice$/ }),
  ).toBeVisible();

  const imranPoll = imran.getByRole('region', { name: 'Poll: Which day suits the viva?' });
  await expect(imranPoll.getByRole('button', { name: /^Tuesday: 1 vote$/ })).toBeVisible();
  await expect(imranPoll.getByText('1 vote', { exact: true })).toBeVisible();

  await imranPoll.getByRole('button', { name: 'Close poll' }).click();
  await expect(hiraPoll.getByText('Closed')).toBeVisible();
  await expect(hiraPoll.getByRole('button', { name: /^Monday: / })).toBeDisabled();
});
