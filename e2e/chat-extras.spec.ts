import { expect, openConversation, PEOPLE, test } from './fixtures';

const AWT = 'Advanced Web Technologies · BCS-7A';

const row = (page: import('@playwright/test').Page, text: string) =>
  page.locator('.group\\/message').filter({ hasText: text }).last();

test('a mention, a pin, a reaction and a reply all reach the other person live', async ({
  person,
}) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);
  await openConversation(imran, AWT);
  await openConversation(hira, AWT);

  // Imran mentions Hira by picking her from the suggestions.
  const box = imran.getByRole('textbox', { name: `Message ${AWT}` });
  await box.pressSequentially('Demo day: @Hir');
  await imran.getByRole('option', { name: 'Hira Khan' }).click();
  await box.pressSequentially('please present first.');
  await box.press('Enter');
  await expect(
    hira
      .getByRole('region', { name: /Notifications/ })
      .getByText(`Dr. Imran Haider mentioned you in ${AWT}`),
  ).toBeVisible();
  // Close the toast so it doesn't cover the message toolbar.
  await hira.getByRole('button', { name: 'Close toast' }).first().click();

  // He pins it; she sees the pin.
  const sent = row(imran, 'please present first.');
  await sent.hover();
  await sent.getByRole('button', { name: 'Pin message' }).click();
  await expect(row(hira, 'please present first.')).toContainText('Pinned by Dr. Imran Haider');

  // She reacts; he sees the count.
  const received = row(hira, 'please present first.');
  await received.hover();
  await received.getByRole('button', { name: 'Add reaction' }).click();
  await hira.getByRole('menuitem', { name: 'React with 🎉' }).click();
  await expect(sent.getByRole('button', { name: /^🎉 1/ })).toBeVisible();

  // She replies; he sees what she is answering.
  await received.hover();
  await received.getByRole('button', { name: 'Reply' }).click();
  await hira.getByRole('textbox', { name: `Message ${AWT}` }).fill('Happy to go first.');
  await hira.getByRole('textbox', { name: `Message ${AWT}` }).press('Enter');
  await expect(row(imran, 'Happy to go first.')).toContainText('Demo day: @Hira Khan');
  await expect(imran.getByRole('button', { name: 'Pinned messages (1)' })).toBeVisible();
});

test('a student asks anonymously; the teacher sees the question but not the name', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);
  await openConversation(hira, AWT);
  await openConversation(imran, AWT);

  await hira.getByRole('button', { name: 'Ask anonymously' }).click();
  const ask = hira.getByRole('textbox', { name: `Ask ${AWT} anonymously` });
  await ask.fill('Is the viva individual or in pairs?');
  await ask.press('Enter');

  const question = row(imran, 'Is the viva individual or in pairs?');
  await expect(question).toContainText('Anonymous student');
  await expect(question).not.toContainText('Hira');
  // Hira still sees it's hers.
  await expect(row(hira, 'Is the viva individual or in pairs?')).toContainText(
    'Anonymous to others',
  );
});
