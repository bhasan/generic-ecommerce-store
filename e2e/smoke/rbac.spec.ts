import { test, expect } from '@playwright/test';
import { ACCOUNTS, Account } from '../helpers/accounts';
import { ROUTES, UNAUTHORIZED_REDIRECT, Role } from '../helpers/routes';
import { establishSession } from '../helpers/auth';

// One describe block per role so Playwright groups traces cleanly.
for (const [roleKey, account] of Object.entries(ACCOUNTS) as [Role, Account][]) {
  test.describe(`RBAC — ${roleKey}`, () => {
    test.beforeEach(async ({ context }) => { await establishSession(context, account); });

    for (const route of ROUTES) {
      const isAllowed = route.allowed.includes(roleKey);

      test(`${isAllowed ? '✓' : '✗'} ${route.path}`, async ({ page }) => {
        await page.goto(route.path);

        if (isAllowed) {
          // Authorized: ProtectedRoute renders children without redirecting.
          // Wait for React to settle, then confirm URL stayed on the expected route.
          await page.waitForLoadState('networkidle');
          const finalPath = new URL(page.url()).pathname;
          expect(finalPath.startsWith(route.path)).toBeTruthy();
        } else {
          // Unauthorized-but-authenticated: ProtectedRoute redirects to /products
          // Use a predicate (not a glob) so /manage-store/products does not match.
          await page.waitForURL(url => url.pathname === UNAUTHORIZED_REDIRECT, { timeout: 10_000 });
          expect(new URL(page.url()).pathname).toBe(UNAUTHORIZED_REDIRECT);
        }
      });
    }
  });
}
