import { type Browser, expect, type Page } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
}

/** A separate browser context = a separate cookie jar = a different person. */
export async function personPage(browser: Browser, identifier: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, identifier);
  return page;
}

export function conversation(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Conversations' }).getByRole('link', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
}

export async function openConversation(page: Page, name: string) {
  await conversation(page, name).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: /^Message / });
}
