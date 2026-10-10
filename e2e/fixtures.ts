import {
  type BrowserContext,
  type BrowserContextOptions,
  test as base,
  expect,
  type Page,
} from '@playwright/test';

export { expect };

export const PASSWORD = 'Comsats@2026';

export const PEOPLE = {
  admin: 'admin@comsats.edu.pk',
  imran: 'imran.haider@comsats.edu.pk',
  hira: 'FA23-BCS-002',
  usman: 'FA23-BCS-031',
  mehwish: 'FA23-BEE-002',
} as const;

/** Signs in through the real login form. */
export async function signIn(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Email or registration number').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByTestId('connection')).toHaveAttribute('data-state', 'connected');
}

type PersonFixture = (identifier: string, options?: BrowserContextOptions) => Promise<Page>;

/**
 * `person(id)` signs someone in inside their own browser context: a separate cookie jar is a
 * different person. Every context is closed when the test ends.
 */
export const test = base.extend<{ person: PersonFixture }>({
  person: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (identifier, options = {}) => {
      const context = await browser.newContext(options);
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, identifier);
      return page;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export function conversation(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Conversations' }).getByRole('link', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
}

/** Opens the Chats area (people land on Home after signing in). */
export async function goToChats(page: Page) {
  if (new URL(page.url()).pathname.startsWith('/chat')) return;
  const rail = page.getByRole('navigation', { name: 'Workspace' });
  const tabs = page.getByRole('navigation', { name: 'Main' });
  const nav = (await rail.isVisible()) ? rail : tabs;
  await nav.getByRole('link', { name: /Chats/ }).click();
  await expect(page).toHaveURL(/\/chat/);
}

export async function openConversation(page: Page, name: string) {
  await goToChats(page);
  await conversation(page, name).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: /^Message / });
}
