import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginViaApi, seedBrowserSession } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

const screenshotDir = path.join(liveEnv.reportsDir, 'screenshots');

test.describe('mobile and visual QA @mobile', () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
  });

  test('login has no console errors or horizontal overflow at 390x844', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, 'mobile-login.png'), fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('authenticated product route remains usable on mobile', async ({ page, request }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    const { token, user } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );

    await seedBrowserSession(page, token, user);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotDir, 'mobile-products.png'), fullPage: true });

    const bodyText = (await page.locator('body').innerText()).trim();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(bodyText.length).toBeGreaterThan(40);
    expect(overflow).toBe(false);
  });
});
