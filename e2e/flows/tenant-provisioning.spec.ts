/**
 * Super-admin tenant provisioning flow.
 *
 * Exercises the platform-operator journey end to end through the UI:
 *   - A SUPER_ADMIN logs in, opens website-management → Tenants, and provisions a
 *     new tenant; the one-time machine tokens are revealed; the tenant lists ACTIVE.
 *   - The super-admin suspends it; the status badge flips to SUSPENDED.
 *   - A regular ADMIN does NOT see the Tenants nav item (it is SUPER_ADMIN-only).
 *
 * The super-admin account is seeded by prisma/seed.ts (superadmin / superadmin123,
 * holding SUPER_ADMIN + ADMIN). Defined inline here rather than in helpers/accounts
 * so the shared ALL_ACCOUNTS list (used for storageState setup) is untouched.
 */
import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';

const SUPER_ADMIN = {
  role: 'superadmin',
  username: 'superadmin',
  password: 'superadmin123',
  storageStatePath: '',
};

test.describe('Super-admin tenant provisioning', () => {
  test('super-admin provisions, reveals tokens, and suspends a tenant', async ({ browser }) => {
    const context = await browser.newContext();
    await establishSession(context, SUPER_ADMIN);
    const page = await context.newPage();

    await page.goto('/website-management/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 15_000 });

    // Unique slug per run so reseeds/retries never collide on the slug unique key.
    const slug = `e2eshop${Date.now()}`;
    await page.locator('#tenant-slug').fill(slug);
    await page.locator('#tenant-name').fill('E2E Test Shop');
    await page.locator('#tenant-admin-username').fill(`${slug}admin`);
    await page.locator('#tenant-admin-password').fill('e2epassword123');
    await page.getByRole('button', { name: 'Create tenant' }).click();

    // The two machine tokens are revealed ONCE after creation.
    const panel = page.locator('.tenant-token-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Copy these now', { exact: false })).toBeVisible();
    const tokenValues = panel.locator('.tenant-token-value');
    await expect(tokenValues).toHaveCount(2);
    await expect(tokenValues.first()).not.toHaveText('');

    // The new tenant appears in the table as ACTIVE.
    const row = page.locator('.tenant-table tbody tr').filter({ hasText: slug });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('.tenant-badge')).toHaveText('ACTIVE');

    // Suspend it → badge flips to SUSPENDED.
    await row.getByRole('button', { name: 'Suspend' }).click();
    await expect(row.locator('.tenant-badge')).toHaveText('SUSPENDED', { timeout: 15_000 });

    await context.close();
  });

  test('a regular admin does not see the Tenants nav (SUPER_ADMIN-only)', async ({ browser }) => {
    const context = await browser.newContext();
    await establishSession(context, ACCOUNTS.admin);
    const page = await context.newPage();

    // Admin can use website-management (ADMIN-gated) but must NOT see Tenants.
    await page.goto('/website-management/identity');
    // Wait for the sidebar to render (a non-super-admin nav item is present)…
    await expect(page.getByRole('link', { name: 'Store Identity' })).toBeVisible({ timeout: 15_000 });
    // …and the SUPER_ADMIN-only Tenants item is absent.
    await expect(page.getByRole('link', { name: 'Tenants' })).toHaveCount(0);

    await context.close();
  });
});
