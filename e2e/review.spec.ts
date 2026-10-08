/**
 * Visual review of every screen (light, dark, mobile). Skipped in normal E2E runs:
 *   $env:REVIEW_DIR='<folder>'; npx playwright test e2e/review.spec.ts
 */
import { composer, expect, openConversation, PEOPLE, test } from './fixtures';

const dir = process.env.REVIEW_DIR;
test.skip(!dir, 'Set REVIEW_DIR to capture review screenshots');

const shot = (name: string) => `${dir}/${name}.png`;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const AWT = 'Advanced Web Technologies · BCS-7A';

test('review: desktop light', async ({ browser, person }) => {
  test.setTimeout(240_000);

  const loginContext = await browser.newContext({ viewport: DESKTOP });
  const login = await loginContext.newPage();
  await login.goto('/login');
  await expect(login.getByText('Demo accounts')).toBeVisible();
  await login.screenshot({ path: shot('01-login'), fullPage: true });
  await loginContext.close();

  const hira = await person(PEOPLE.hira, { viewport: DESKTOP, colorScheme: 'light' });
  await hira.waitForTimeout(600);
  await hira.screenshot({ path: shot('02-home') });

  await openConversation(hira, 'BCS-7A Class');
  await hira.waitForTimeout(400);
  await hira.screenshot({ path: shot('03-channel') });

  // Authors can only delete their own messages for 15 minutes, so post a fresh one to get the menu.
  const fresh = 'Could someone share the lab slides from today?';
  await composer(hira).fill(fresh);
  await composer(hira).press('Enter');
  const row = hira.locator('.group\\/message', { hasText: fresh });
  await expect(row).toBeVisible();
  await row.hover();
  await hira.waitForTimeout(150);
  await hira.screenshot({ path: shot('04-hover') });
  await row.getByRole('button', { name: 'Message options' }).click();
  await hira.waitForTimeout(200);
  await hira.screenshot({ path: shot('05-message-menu') });
  await hira.keyboard.press('Escape');

  await openConversation(hira, 'CS Department Notices');
  await hira.waitForTimeout(300);
  await hira.screenshot({ path: shot('06-announcement') });

  await openConversation(hira, AWT);
  await hira.getByRole('button', { name: /^Members/ }).click();
  await hira.waitForTimeout(500);
  await hira.screenshot({ path: shot('07-course-members') });

  await openConversation(hira, 'Dr. Imran Haider');
  await hira.waitForTimeout(300);
  await hira.screenshot({ path: shot('08-dm') });

  await hira.keyboard.press('Control+k');
  await hira.getByRole('combobox', { name: 'Jump to a conversation' }).fill('c');
  await hira.waitForTimeout(300);
  await hira.screenshot({ path: shot('09-switcher') });
  await hira.keyboard.press('Escape');

  await hira.getByRole('button', { name: 'New message' }).first().click();
  await hira.waitForTimeout(400);
  await hira.screenshot({ path: shot('10-new-message') });
  await hira.keyboard.press('Escape');

  await hira.getByRole('button', { name: 'Browse societies' }).click();
  await hira.waitForTimeout(400);
  await hira.screenshot({ path: shot('11-societies') });
  await hira.keyboard.press('Escape');

  await hira.getByRole('button', { name: 'Account menu' }).click();
  await hira.waitForTimeout(250);
  await hira.screenshot({ path: shot('12-account-menu') });
  await hira.keyboard.press('Escape');

  await hira.getByRole('button', { name: /COMSATS Islamabad/ }).click();
  await hira.waitForTimeout(250);
  await hira.screenshot({ path: shot('13-workspace-menu') });
  await hira.keyboard.press('Escape');

  const imran = await person(PEOPLE.imran, { viewport: DESKTOP, colorScheme: 'light' });
  await openConversation(imran, AWT);
  await imran.waitForTimeout(300);
  await imran.screenshot({ path: shot('14-instructor-course') });
  await imran.getByRole('button', { name: 'Lock group' }).click();
  await openConversation(hira, AWT);
  await expect(hira.getByTestId('composer-locked')).toBeVisible();
  await hira.waitForTimeout(300);
  await hira.screenshot({ path: shot('15-locked') });
  await imran.getByRole('button', { name: 'Unlock group' }).click();

  const admin = await person(PEOPLE.admin, { viewport: DESKTOP, colorScheme: 'light' });
  await admin.waitForTimeout(400);
  await admin.screenshot({ path: shot('16-admin-chat-home') });
  for (const [path, name] of [
    ['/admin', 'overview'],
    ['/admin/users', 'users'],
    ['/admin/structure', 'structure'],
    ['/admin/groups', 'groups'],
    ['/admin/audit', 'audit'],
  ]) {
    await admin.goto(path);
    await admin.waitForTimeout(900);
    await admin.screenshot({ path: shot(`17-admin-${name}`), fullPage: true });
  }
  await admin.goto('/admin/groups');
  await admin.getByText('CS Faculty Lounge').first().click();
  await admin.waitForTimeout(600);
  await admin.screenshot({ path: shot('18-admin-group-detail'), fullPage: true });
});

test('review: dark and mobile', async ({ browser, person }) => {
  test.setTimeout(180_000);

  const dark = await person(PEOPLE.hira, { viewport: DESKTOP, colorScheme: 'dark' });
  await openConversation(dark, 'BCS-7A Class');
  await dark.waitForTimeout(400);
  await dark.screenshot({ path: shot('20-dark-channel') });
  await dark.keyboard.press('Control+k');
  await dark.waitForTimeout(300);
  await dark.screenshot({ path: shot('21-dark-switcher') });
  await dark.keyboard.press('Escape');

  const darkAdmin = await person(PEOPLE.admin, { viewport: DESKTOP, colorScheme: 'dark' });
  await darkAdmin.goto('/admin');
  await darkAdmin.waitForTimeout(900);
  await darkAdmin.screenshot({ path: shot('22-dark-admin') });

  const darkLoginContext = await browser.newContext({ viewport: DESKTOP, colorScheme: 'dark' });
  const darkLogin = await darkLoginContext.newPage();
  await darkLogin.goto('/login');
  await expect(darkLogin.getByText('Demo accounts')).toBeVisible();
  await darkLogin.screenshot({ path: shot('23-dark-login') });
  await darkLoginContext.close();

  const phone = { viewport: MOBILE, colorScheme: 'light' as const, isMobile: true, hasTouch: true };
  const mobile = await person(PEOPLE.hira, phone);
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: shot('24-mobile-list') });
  await openConversation(mobile, 'BCS-7A Class');
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: shot('25-mobile-channel') });

  const mobileAdmin = await person(PEOPLE.admin, phone);
  await mobileAdmin.goto('/admin/users');
  await mobileAdmin.waitForTimeout(900);
  await mobileAdmin.screenshot({ path: shot('26-mobile-admin') });

  const mobileLoginContext = await browser.newContext(phone);
  const mobileLogin = await mobileLoginContext.newPage();
  await mobileLogin.goto('/login');
  await expect(mobileLogin.getByText('Demo accounts')).toBeVisible();
  await mobileLogin.screenshot({ path: shot('27-mobile-login') });
  await mobileLoginContext.close();
});
