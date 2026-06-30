/**
 * Variant editing combinations test suite.
 *
 * Covers all the ways variants can be used:
 *   - Customer product page: variant selector styling, active state, price update, OOS disable
 *   - Product quick-view modal: variant buttons work
 *   - Single-variant product: no variant selector shown
 *   - Admin edit modal: add/remove variants, pricing mode, price breaks, qty options,
 *     stock toggle, active/inactive, default radio, label/price editing, cancel
 */

import { test, expect, Page } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';
import { fetchProducts } from '../helpers/products';

// ── helpers ────────────────────────────────────────────────────────────────

async function getProductId(page: Page, name: string): Promise<number> {
  const products = await fetchProducts(page.request);
  const p = products.find((x: any) => x.name === name);
  if (!p) throw new Error(`Product "${name}" not found in seed data`);
  return p.id;
}

async function openManageProducts(page: Page) {
  await page.goto('/manage-products');
  await page.waitForLoadState('networkidle');
}

async function openEditModal(page: Page, productName?: string) {
  if (productName) {
    const row = page.locator('.product-card, .product-item-card, tr').filter({ hasText: productName }).first();
    await row.locator('.btn-edit').first().click();
  } else {
    const editBtns = page.locator('.btn-edit');
    await expect(editBtns.first()).toBeVisible({ timeout: 10_000 });
    await editBtns.first().click();
  }
  await expect(page.locator('.modal-overlay, [role="dialog"]').first()).toBeVisible({ timeout: 8_000 });
}

// ── CUSTOMER-FACING: variant selector on product page ─────────────────────

test.describe('Customer view — variant selector', () => {
  test.beforeEach(async ({ context }) => { await establishSession(context, ACCOUNTS.admin); });

  test('variant buttons have the variant-btn class applied (styled)', async ({ page }) => {
    const id = await getProductId(page, 'Flow Test Hoodie');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    const btns = page.locator('.variant-btn');
    await expect(btns.first()).toBeVisible({ timeout: 10_000 });

    // Verify buttons have our custom class (not bare browser defaults)
    const className = await btns.first().getAttribute('class');
    expect(className).toContain('variant-btn');

    // Verify the button has a border (CSS token applied)
    const borderStyle = await btns.first().evaluate(el =>
      window.getComputedStyle(el).borderStyle
    );
    expect(borderStyle).toBe('solid');
  });

  test('exactly one variant button is active at a time', async ({ page }) => {
    const id = await getProductId(page, 'Flow Test Hoodie');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    const btns = page.locator('.variant-btn');
    await expect(btns.first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.variant-btn-active')).toHaveCount(1);

    await btns.nth(1).click();
    await expect(page.locator('.variant-btn-active')).toHaveCount(1);
    await expect(btns.nth(1)).toHaveClass(/variant-btn-active/);
    await expect(btns.first()).not.toHaveClass(/variant-btn-active/);
  });

  test('price display updates when a different-priced variant is selected', async ({ page }) => {
    const id = await getProductId(page, 'Flow Test Hoodie');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    const btns = page.locator('.variant-btn');
    await expect(btns.first()).toBeVisible({ timeout: 10_000 });

    await btns.first().click(); // Small $29.99
    const price1 = await page.locator('.product-price-display').textContent();

    await btns.nth(1).click(); // Medium $34.99
    const price2 = await page.locator('.product-price-display').textContent();

    expect(price1?.trim()).not.toBe(price2?.trim());
  });

  test('out-of-stock variant (Large) disables the add-to-cart button', async ({ page }) => {
    const id = await getProductId(page, 'Flow Test Hoodie');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    const btns = page.locator('.variant-btn');
    await expect(btns.first()).toBeVisible({ timeout: 10_000 });

    await btns.nth(2).click(); // Large — stock = 0
    await expect(page.locator('.btn-add-to-cart-large')).toBeDisabled();
  });

  test('in-stock variant (Small) enables the add-to-cart button', async ({ page }) => {
    const id = await getProductId(page, 'Flow Test Hoodie');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    const btns = page.locator('.variant-btn');
    await expect(btns.first()).toBeVisible({ timeout: 10_000 });

    await btns.first().click(); // Small — in stock
    await expect(page.locator('.btn-add-to-cart-large')).toBeEnabled();
  });

  test('single-variant product shows no variant selector (or only 1 btn)', async ({ page }) => {
    const id = await getProductId(page, 'Wireless Headphones');
    await page.goto(`/products/${id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.btn-add-to-cart-large')).toBeVisible({ timeout: 10_000 });

    const variantSelector = page.locator('.variant-selector');
    const count = await variantSelector.count();
    if (count > 0) {
      expect(await page.locator('.variant-btn').count()).toBeLessThanOrEqual(1);
    }
  });

  test('variant selector works inside the product quick-view modal', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // The product card's image or heading triggers the modal
    const hoodieHeading = page.getByRole('heading', { name: 'Flow Test Hoodie' }).first();
    await expect(hoodieHeading).toBeVisible({ timeout: 10_000 });
    // Click the parent product card via the heading
    await hoodieHeading.click();

    const modal = page.locator('.product-modal');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    const modalBtns = modal.locator('.variant-btn');
    const count = await modalBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);

    if (count > 1) {
      await expect(modal.locator('.variant-btn-active')).toHaveCount(1);
      await modalBtns.nth(1).click();
      await expect(modal.locator('.variant-btn-active')).toHaveCount(1);
      await expect(modalBtns.nth(1)).toHaveClass(/variant-btn-active/);
    }
  });
});

// ── ADMIN: variant editing in ProductFormModal ────────────────────────────

test.describe('Admin edit — variant combinations', () => {
  test.beforeEach(async ({ context, page }) => {
    await establishSession(context, ACCOUNTS.admin);
    await openManageProducts(page);
    await expect(page.locator('.btn-edit').first()).toBeVisible({ timeout: 10_000 });
  });

  test('each product in the list has an Edit button', async ({ page }) => {
    expect(await page.locator('.btn-edit').count()).toBeGreaterThan(0);
  });

  test('edit modal opens and shows at least one variant row', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Add Variant button appends a new variant row', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });
    const before = await page.locator('.variant-row').count();

    await page.locator('button:has-text("Add Variant")').click();
    await expect(page.locator('.variant-row')).toHaveCount(before + 1);
  });

  test('Remove Variant button removes the row (when >1 exists)', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });

    const before = await page.locator('.variant-row').count();
    if (before < 2) {
      await page.locator('button:has-text("Add Variant")').click();
      await expect(page.locator('.variant-row')).toHaveCount(before + 1);
    }

    const rowCount = await page.locator('.variant-row').count();
    const removeBtn = page.locator('button[title="Remove variant"]').last();
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();
    await expect(page.locator('.variant-row')).toHaveCount(rowCount - 1);
  });

  test('Remove Variant button is absent when only one variant row exists', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });

    const rowCount = await page.locator('.variant-row').count();
    if (rowCount === 1) {
      await expect(page.locator('button[title="Remove variant"]')).toHaveCount(0);
    } else {
      test.info().annotations.push({ type: 'skip', description: 'Product has multiple variants' });
    }
  });

  test('pricing mode UNIT → WEIGHT reveals Quantity Options section', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    await row.locator('select').first().selectOption('WEIGHT');
    await row.locator('button[title="Quantity options / price breaks"]').click();
    await expect(page.getByText('Quantity Options (WEIGHT mode)')).toBeVisible();
  });

  test('price breaks: Add button appends a tier, Remove button removes it', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    // Expand options panel
    await row.locator('button[title="Quantity options / price breaks"]').click();
    await expect(page.getByText('Price Breaks', { exact: true }).first()).toBeVisible();

    const beforeCount = await page.locator('input[placeholder="Min qty"]').count();
    // "Add" button in the Price Breaks section (second column = last Add btn)
    await page.locator('.btn-secondary.btn-sm', { hasText: 'Add' }).last().click();
    await expect(page.locator('input[placeholder="Min qty"]')).toHaveCount(beforeCount + 1);

    await page.locator('input[placeholder="Min qty"]').last().fill('5');
    await page.locator('input[placeholder="Unit price"]').last().fill('9.99');

    // Remove via the btn-remove-image × button in that price-break row
    const removeBtns = page.locator('.btn-remove-image');
    await removeBtns.last().click();
    await expect(page.locator('input[placeholder="Min qty"]')).toHaveCount(beforeCount);
  });

  test('quantity options: Add button appends an option row', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    await row.locator('button[title="Quantity options / price breaks"]').click();
    await expect(page.getByText('Quantity Options (WEIGHT mode)')).toBeVisible();

    const beforeCount = await page.locator('input[placeholder="e.g. 0.5"]').count();

    // Scope to the qty options label container and click its Add button
    const qtyHeader = page.locator('label', { hasText: 'Quantity Options (WEIGHT mode)' }).locator('..');
    await qtyHeader.locator('button', { hasText: 'Add' }).click();

    const afterCount = await page.locator('input[placeholder="e.g. 0.5"]').count();
    expect(afterCount).toBe(beforeCount + 1);

    // Remove it — the × btn is inside the qty-option row
    const qtyInput = page.locator('input[placeholder="e.g. 0.5"]').last();
    const qtyRow = qtyInput.locator('..');
    await qtyRow.locator('.btn-remove-image').click();
    await expect(page.locator('input[placeholder="e.g. 0.5"]')).toHaveCount(beforeCount);
  });

  test('Track Stock checkbox toggles stock input enabled state', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    // Stock input is the second number input (basePrice is first)
    const stockInput = row.locator('input[placeholder="0"]');
    // Track Stock is the first checkbox
    const trackCheckbox = row.locator('input[type="checkbox"]').first();

    const isChecked = await trackCheckbox.isChecked();
    if (isChecked) {
      await expect(stockInput).toBeEnabled();
      await trackCheckbox.uncheck();
      await expect(stockInput).toBeDisabled();
      await trackCheckbox.check();
      await expect(stockInput).toBeEnabled();
    } else {
      await expect(stockInput).toBeDisabled();
      await trackCheckbox.check();
      await expect(stockInput).toBeEnabled();
    }
  });

  test('Active checkbox can be toggled on and off', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    // Active is the second checkbox (Track Stock is first, Active is second)
    const activeCheckbox = row.locator('input[type="checkbox"]').nth(1);
    const before = await activeCheckbox.isChecked();
    await activeCheckbox.setChecked(!before);
    expect(await activeCheckbox.isChecked()).toBe(!before);
    await activeCheckbox.setChecked(before);
  });

  test('Default radio: selecting second row makes it the default', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });

    const rowCount = await page.locator('.variant-row').count();
    if (rowCount < 2) {
      await page.locator('button:has-text("Add Variant")').click();
      await expect(page.locator('.variant-row')).toHaveCount(2);
    }

    const radios = page.locator('.variant-row input[type="radio"]');
    await radios.nth(1).check();
    expect(await radios.nth(1).isChecked()).toBe(true);
    expect(await radios.nth(0).isChecked()).toBe(false);
  });

  test('editing the label field updates its value', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    const labelInput = row.locator('input[type="text"]').first();
    const original = await labelInput.inputValue();
    await labelInput.fill('Test Label XYZ');
    expect(await labelInput.inputValue()).toBe('Test Label XYZ');
    await labelInput.fill(original);
  });

  test('editing the base price field updates its value', async ({ page }) => {
    await openEditModal(page);
    const row = page.locator('.variant-row').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    const priceInput = row.locator('input[placeholder="0.00"]');
    const original = await priceInput.inputValue();
    await priceInput.fill('99.99');
    expect(await priceInput.inputValue()).toBe('99.99');
    await priceInput.fill(original);
  });

  test('cancel button closes the edit modal without saving', async ({ page }) => {
    await openEditModal(page);
    await expect(page.locator('.variant-row').first()).toBeVisible({ timeout: 8_000 });

    await page.locator('button.btn-cancel, button:has-text("Cancel")').first().click();
    await expect(page.locator('.modal-overlay, [role="dialog"]').first()).not.toBeVisible({ timeout: 6_000 });
  });
});
