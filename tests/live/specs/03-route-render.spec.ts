import { expect, test } from '@playwright/test';
import { loginViaApi, seedBrowserSession } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

const protectedRoutes = [
  '/products',
  '/cart',
  '/profile',
  '/my-orders',
  '/help',
];

test.describe('route render matrix @route-render @console', () => {
  test('login and register render route-specific content', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /register|create account/i })).toBeVisible();

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('authenticated customer routes render more than the shared shell', async ({ page, request }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    const { token, user } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );

    await seedBrowserSession(page, token, user);

    for (const route of protectedRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/\/login$/);
      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length, `${route} body text length`).toBeGreaterThan(40);
    }
  });
});
