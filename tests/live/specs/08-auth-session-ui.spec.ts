import { expect, test } from '@playwright/test';
import { hasPersona, liveEnv } from '../helpers/env';

test.describe('UI auth, logout, and session storage @auth-ui @session @route-render', () => {
  test('customer can log in through the UI and log out without stale session data', async ({ page }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(liveEnv.personas.customer.username!);
    await page.locator('#password').fill(liveEnv.personas.customer.password!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('authToken'))).toBeTruthy();
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible();
    await expect(page.getByText(liveEnv.personas.customer.username!, { exact: false }).first()).toBeVisible();

    await page.getByRole('button', { name: /user menu/i }).click();
    await page.getByRole('button', { name: /logout/i }).click();

    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('authToken'))).toBeNull();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('userData'))).toBeNull();
    await expect(page.getByRole('link', { name: /^login$/i })).toBeVisible();
  });

  test('same-tab session can recover after logout and second login', async ({ page }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.locator('#username').fill(liveEnv.personas.customer.username!);
      await page.locator('#password').fill(liveEnv.personas.customer.password!);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('authToken'))).toBeTruthy();
      await page.goto('/products', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible();
      await page.getByRole('button', { name: /user menu/i }).click();
      await page.getByRole('button', { name: /logout/i }).click();
      await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('authToken'))).toBeNull();
    }
  });
});
