import { expect, test } from '@playwright/test';
import { loginViaApi, seedBrowserSession } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

function moneyToNumber(text: string) {
  const match = text.replace(/,/g, '').match(/\$(-?\d+(?:\.\d{1,2})?)/);
  if (!match) throw new Error(`Could not parse money value from: ${text}`);
  return Number(match[1]);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

test.describe('product browse and cart math @workflow @math @route-render', () => {
  test('customer can add a product to cart and UI totals reconcile', async ({ page, request }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    const { token, user } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );
    await seedBrowserSession(page, token, user);

    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const firstAddButton = page.getByRole('button', { name: /add to cart/i }).first();
    await expect(firstAddButton).toBeVisible();
    await firstAddButton.click();

    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible();

    const itemTotal = moneyToNumber(await page.locator('.cart-item-total').first().innerText());
    const subtotal = moneyToNumber(await page.locator('.summary-row').filter({ hasText: /^Subtotal/ }).innerText());
    const tax = moneyToNumber(await page.locator('.summary-row').filter({ hasText: /Tax/ }).innerText());
    const total = moneyToNumber(await page.locator('.summary-total').innerText());

    expect(subtotal).toBeCloseTo(itemTotal, 2);
    expect(total).toBeCloseTo(roundMoney(subtotal + tax), 2);
    expect(tax).toBeGreaterThanOrEqual(0);

    await expect(page.getByRole('button', { name: /proceed to checkout/i })).toBeVisible();
  });
});
