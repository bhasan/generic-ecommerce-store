import { Page } from '@playwright/test';
import { Account } from './accounts';

export async function loginViaUI(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.locator('#username').fill(account.username);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait until redirected away from /login (real JWT stored in localStorage)
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}
