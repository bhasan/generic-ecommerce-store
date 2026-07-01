import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { loginViaUI } from '../helpers/auth';

test.describe('Auth flows', () => {
  test('login success redirects away from /login', async ({ page }) => {
    await loginViaUI(page, ACCOUNTS.customer);
    expect(new URL(page.url()).pathname).not.toBe('/login');
  });

  test('wrong password shows error on /login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill(ACCOUNTS.customer.username);
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 8_000 });
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('register with unique username lands on pending state', async ({ page }) => {
    const unique = `e2euser_${Date.now()}`;
    await page.goto('/register');
    await page.locator('#username').fill(unique);
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#phoneNumber').fill('(512) 555-0199');
    // Fill cashapp if the field is visible (store may have cashapp payments enabled)
    const cashappField = page.locator('#cashapp');
    if (await cashappField.isVisible()) {
      await cashappField.fill(`$${unique}`);
    }
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Registration Submitted')).toBeVisible({ timeout: 10_000 });
  });

  test('logout clears session and redirects to /login', async ({ page }) => {
    await loginViaUI(page, ACCOUNTS.customer);
    // Open the profile dropdown then click Logout
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/login', { timeout: 8_000 });
    expect(new URL(page.url()).pathname).toBe('/login');
    // The access token lives in memory (cleared on logout) and the refresh
    // token is an httpOnly cookie the backend clears — assert the cookie is gone.
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'refreshToken')).toBeUndefined();
  });


});
