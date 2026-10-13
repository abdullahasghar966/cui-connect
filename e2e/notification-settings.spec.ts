import { expect, openConversation, test } from './fixtures';

const AWT = 'Advanced Web Technologies · BCS-7A';
const AHMED = 'FA23-BCS-003';

test('a student turns mentions off, then back on', async ({ person }) => {
  const ahmed = await person(AHMED);
  const imran = await person('imran.haider@comsats.edu.pk');
  const toasts = ahmed.getByRole('region', { name: /Notifications/ });

  await ahmed.goto('/me/notifications');
  await expect(
    ahmed.getByRole('heading', { level: 1, name: 'Notification settings' }),
  ).toBeVisible();
  await expect(ahmed.getByText('Always on')).toBeVisible();
  await ahmed.getByLabel('Mentions in chats').selectOption('off');
  await expect(toasts.getByText('Saved')).toBeVisible();

  // Imran mentions him: the message arrives, the notification doesn't.
  await openConversation(ahmed, AWT);
  await openConversation(imran, AWT);
  const mention = async (text: string) => {
    const box = imran.getByRole('textbox', { name: `Message ${AWT}` });
    await box.pressSequentially('@Ahmed N');
    await imran.getByRole('option', { name: 'Ahmed Nawaz' }).click();
    await box.pressSequentially(text);
    await box.press('Enter');
    await expect(ahmed.getByText(text)).toBeVisible();
  };
  await mention('please check the lab sheet.');
  await ahmed.goto('/notifications');
  await expect(ahmed.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expect(ahmed.getByText(/mentioned you/)).toHaveCount(0);

  // Back on: the next mention reaches him live.
  await ahmed.getByRole('link', { name: 'Settings' }).click();
  await ahmed.getByLabel('Mentions in chats').selectOption('all');
  await expect(toasts.getByText('Saved')).toBeVisible();
  await openConversation(ahmed, AWT);
  await mention('see you in the lab at 11.');
  await expect(toasts.getByText(`Dr. Imran Haider mentioned you in ${AWT}`)).toBeVisible();
});
