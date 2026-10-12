import { expect, PEOPLE, test } from './fixtures';

test('a student books office hours; the teacher is told and can cancel with a reason', async ({
  person,
}) => {
  const hira = await person(PEOPLE.hira);
  const imran = await person(PEOPLE.imran);

  await hira.goto('/academics/teachers?q=Imran');
  const card = hira.getByRole('listitem', { name: 'Dr. Imran Haider' });
  await card.getByRole('button', { name: 'Book office hours' }).click();
  const dialog = hira.getByRole('dialog');
  // The first free time (taken ones are disabled).
  const slot = dialog.locator('fieldset button:not([disabled])').first();
  const when = (await slot.getAttribute('aria-label')) ?? '';
  await slot.click();
  await dialog.getByLabel('What would you like to discuss?').fill('My Assignment 2 API design');
  await dialog.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(hira.getByText(/^Booked: /)).toBeVisible();

  // The teacher hears about it live and finds it under Appointments.
  await expect(
    imran
      .getByRole('region', { name: /Notifications/ })
      .getByText('Office hours booked: Hira Khan'),
  ).toBeVisible();
  await imran.goto('/academics/teachers?tab=appointments');
  const appointment = imran.getByRole('listitem').filter({ hasText: 'My Assignment 2 API design' });
  await expect(appointment).toContainText('Hira Khan');
  await expect(appointment).toContainText(when.split(' at ')[0] ?? '');

  await appointment.getByRole('button', { name: 'Cancel' }).click();
  await imran.getByLabel('Reason (optional)').fill('A faculty meeting came up');
  await imran.getByRole('button', { name: 'Cancel appointment' }).click();

  await expect(
    hira
      .getByRole('region', { name: /Notifications/ })
      .getByText('Dr. Imran Haider cancelled your office-hours appointment'),
  ).toBeVisible();
  await hira.goto('/academics/teachers?tab=appointments');
  await expect(
    hira.getByRole('listitem').filter({ hasText: 'My Assignment 2 API design' }),
  ).toContainText('Cancelled');
});

test('the app can be installed and offers phone notifications', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  const manifest = await (await hira.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'CUI Connect',
    display: 'standalone',
    start_url: '/home',
  });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  await hira.goto('/notifications');
  // The service worker that shows push notifications is installed and running.
  expect(await hira.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBe(
    true,
  );
  // Headless Chrome can't show notifications, so the card explains what to do instead of
  // offering the switch; a real browser shows "Turn on".
  const card = hira.getByRole('region', { name: 'Phone notifications' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Turn on|blocked|Home Screen|can.t show/);
});
