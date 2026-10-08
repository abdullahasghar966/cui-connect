/**
 * Regenerates the README screenshots (docs/screenshots). Skipped in normal E2E runs:
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
import { io } from 'socket.io-client';
import { expect, openConversation, PEOPLE, test } from './fixtures';

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to regenerate docs/screenshots');

const shot = (name: string) => `docs/screenshots/${name}.png`;
const DESKTOP = { width: 1440, height: 900 };

test('capture documentation screenshots', async ({ browser, person, baseURL }) => {
  test.setTimeout(120_000);

  const loginContext = await browser.newContext({ viewport: DESKTOP });
  const login = await loginContext.newPage();
  await login.goto('/login');
  await expect(login.getByText('Demo accounts')).toBeVisible();
  await login.screenshot({ path: shot('login') });
  await loginContext.close();

  const imran = await person(PEOPLE.imran, { viewport: DESKTOP, colorScheme: 'light' });
  const hira = await person(PEOPLE.hira, { viewport: DESKTOP, colorScheme: 'light' });
  await openConversation(imran, 'Advanced Web Technologies · BCS-7A');
  await openConversation(hira, 'Advanced Web Technologies · BCS-7A');
  await imran
    .getByRole('textbox', { name: /^Message / })
    .fill(
      'Reminder: bring your laptops to Lab 3 tomorrow. We will test the Socket.IO assignments live.',
    );
  await imran.getByRole('textbox', { name: /^Message / }).press('Enter');
  await expect(hira.getByRole('main').getByText(/bring your laptops/)).toBeVisible();
  await hira
    .getByRole('textbox', { name: /^Message / })
    .fill('Thank you sir, I will have the demo ready.');
  await hira.getByRole('textbox', { name: /^Message / }).press('Enter');
  await imran.getByRole('button', { name: /^Members/ }).click();
  await imran.waitForTimeout(400);
  await imran.screenshot({ path: shot('chat-instructor') });

  await openConversation(hira, 'CS Department Notices');
  await hira.screenshot({ path: shot('announcement-read-only') });

  await imran.getByRole('button', { name: 'Lock group' }).click();
  await openConversation(hira, 'Advanced Web Technologies · BCS-7A');
  await expect(hira.getByTestId('composer-locked')).toBeVisible();
  await hira.waitForTimeout(300);
  await hira.screenshot({ path: shot('course-locked') });
  await imran.getByRole('button', { name: 'Unlock group' }).click();

  const admin = await person(PEOPLE.admin, { viewport: DESKTOP, colorScheme: 'light' });
  await admin.goto('/admin');
  await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible();
  const session = (await hira.context().cookies()).find((c) => c.name === 'cui_session');
  const groups = await (await hira.request.get('/api/groups')).json();
  const campus = groups.find((g: { name: string }) => g.name === 'CUI Islamabad Official');
  const raw = io(baseURL, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { cookie: `cui_session=${session?.value}` },
  });
  await raw.timeout(5_000).emitWithAck('message:send', {
    groupId: campus.id,
    body: 'Is tomorrow a holiday?',
    clientId: `shot-${Date.now()}`,
  });
  raw.disconnect();
  await expect(admin.getByText(/Hira Khan was blocked/)).toBeVisible();
  await admin.screenshot({ path: shot('admin-overview'), fullPage: true });

  await admin.goto('/admin/groups');
  await admin.getByText('CS Faculty Lounge').first().click();
  await expect(admin.getByText('From university records').first()).toBeVisible();
  await admin.screenshot({ path: shot('admin-groups') });

  await admin.goto('/admin/structure');
  await admin.getByRole('button', { name: /students of CSC441 BCS-7A/ }).click();
  await expect(admin.getByRole('dialog').getByText('Repeater', { exact: true })).toBeVisible();
  await admin.waitForTimeout(400); // let the dialog finish fading in
  await admin.screenshot({ path: shot('admin-enrollment') });

  const dark = await person(PEOPLE.hira, { viewport: DESKTOP, colorScheme: 'dark' });
  await openConversation(dark, 'BCS-7A Class');
  await dark.screenshot({ path: shot('chat-dark') });
});
