import { test, expect } from '@playwright/test';
import { ACCOUNTS, Account } from '../helpers/accounts';
import { ROUTES, UNAUTHORIZED_REDIRECT, Role } from '../helpers/routes';

// One describe block per role so Playwright groups traces cleanly.
for (const [roleKey, account] of Object.entries(ACCOUNTS) as [Role, Account][]) {
  test.describe(`RBAC — ${roleKey}`, () => {
    test.use({ storageState: account.storageStatePath });

    for (const route of ROUTES) {
      const isAllowed = route.allowed.includes(roleKey);

      test(`${isAllowed ? '✓' : '✗'} ${route.path}`, async ({ page }) => {
        await page.goto(route.path);

        if (isAllowed) {
          // Authorized: ProtectedRoute renders children without redirecting.
          // Wait for React to settle, then confirm URL stayed on the expected route.
          await page.waitForLoadState('networkidle');
          const finalPath = new URL(page.url()).pathname;
          expect(finalPath).toBe(route.path);
        } else {
          // Unauthorized-but-authenticated: ProtectedRoute redirects to /products
          await page.waitForURL(`**${UNAUTHORIZED_REDIRECT}`, { timeout: 10_000 });
          expect(new URL(page.url()).pathname).toBe(UNAUTHORIZED_REDIRECT);
        }
      });
    }
  });
}
