import { test, expect, request } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import {
  getDefaultTenantId,
  createTestStore,
  createStoreVariantOverride,
  deleteTestStore,
} from '../helpers/db';

const API = 'http://localhost:3000';

// Creates a product with a single variant at stock=1, returns { variantId, adminToken }.
async function setupRaceProduct(): Promise<{ variantId: number; adminToken: string }> {
  const ctx = await request.newContext();

  const body = await (
    await ctx.post(`${API}/api/auth/login`, {
      data: { username: ACCOUNTS.admin.username, password: ACCOUNTS.admin.password },
    })
  ).json();
  const adminToken = body.data.token;

  const bodyCats = await (
    await ctx.get(`${API}/api/categories`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json();
  const cats = Array.isArray(bodyCats) ? bodyCats : bodyCats.data;
  const catId = (cats as Array<{ id: number }>)[0].id;

  const resBody = await (
    await ctx.post(`${API}/api/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: `Race Test Product ${Date.now()}`,
        categoryId: catId,
        images: [],
        variants: [
          {
            label: 'Default',
            basePrice: 9.99,
            stock: 1, // only 1 unit — exactly enough for one order
            stockEnabled: true,
            isDefault: true,
            active: true,
            pricingMode: 'UNIT',
            quantityOptions: [{ quantity: 1, sortOrder: 0 }],
            priceBreaks: [],
          },
        ],
      },
    })
  ).json();
  const product = resBody.data.product;

  const variantId = (product as { variants: Array<{ id: number }> }).variants[0].id;
  await ctx.dispose();
  return { variantId, adminToken };
}

async function customerToken(): Promise<string> {
  const ctx = await request.newContext();
  const body = await (
    await ctx.post(`${API}/api/auth/login`, {
      data: { username: ACCOUNTS.customer.username, password: ACCOUNTS.customer.password },
    })
  ).json();
  const token = body.data.token;
  await ctx.dispose();
  return token as string;
}

async function placeOrder(token: string, variantId: number): Promise<{ status: number; body: unknown }> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      items: [{ variantId, quantity: 1 }],
      deliveryMethod: 'PICKUP',
      paymentMethod: 'IN_STORE',
    },
  });
  const body = await res.json();
  await ctx.dispose();
  return { status: res.status(), body };
}

async function getVariantStock(variantId: number, adminToken: string): Promise<number> {
  const ctx = await request.newContext();
  // Fetch all products and find this variant
  const resBody = await (
    await ctx.get(`${API}/api/products`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json();
  const products = Array.isArray(resBody) ? resBody : resBody.data;
  await ctx.dispose();
  for (const p of products) {
    const v = p.variants?.find(v => v.id === variantId);
    if (v) return v.stock;
  }
  throw new Error(`Variant ${variantId} not found`);
}

async function placeOrderAtStore(
  token: string,
  variantId: number,
  storeId: number,
): Promise<{ status: number; body: unknown }> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-store-id': String(storeId),
    },
    data: {
      items: [{ variantId, quantity: 1 }],
      deliveryMethod: 'PICKUP',
      paymentMethod: 'IN_STORE',
    },
  });
  const body = await res.json();
  await ctx.dispose();
  return { status: res.status(), body };
}

/**
 * Creates a product with base stock=5 (enough for default-store orders to succeed),
 * then seeds a non-default store S under the same tenant and adds a
 * StoreVariantOverride for that store with stock=1 — so exactly one concurrent
 * order at store S can succeed before stock is exhausted.
 */
async function setupStoreOverrideProduct(): Promise<{
  variantId: number;
  adminToken: string;
  storeS: number;
}> {
  // --- API: login + create product ----------------------------------------
  const ctx = await request.newContext();

  const loginBody = await (
    await ctx.post(`${API}/api/auth/login`, {
      data: { username: ACCOUNTS.admin.username, password: ACCOUNTS.admin.password },
    })
  ).json();
  const adminToken = loginBody.data.token as string;

  const catsBody = await (
    await ctx.get(`${API}/api/categories`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json();
  const cats = Array.isArray(catsBody) ? catsBody : catsBody.data;
  const catId = (cats as Array<{ id: number }>)[0].id;

  const prodBody = await (
    await ctx.post(`${API}/api/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: `Per-Store Race Product ${Date.now()}`,
        categoryId: catId,
        images: [],
        variants: [
          {
            label: 'Default',
            basePrice: 9.99,
            stock: 5, // base stock; default store draws from this
            stockEnabled: true,
            isDefault: true,
            active: true,
            pricingMode: 'UNIT',
            quantityOptions: [{ quantity: 1, sortOrder: 0 }],
            priceBreaks: [],
          },
        ],
      },
    })
  ).json();
  const product = prodBody.data.product as { variants: Array<{ id: number }> };
  const variantId = product.variants[0].id;

  await ctx.dispose();

  // --- Direct DB: create non-default store S + override (stock=1) ----------
  const tenantId = getDefaultTenantId();
  const slug = `race-store-s-${Date.now()}`;
  const storeS = createTestStore(tenantId, slug, 'Race Store S');
  createStoreVariantOverride(tenantId, storeS, variantId, 1);

  return { variantId, adminToken, storeS };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock race condition tests
//
// Requires: the atomic stock decrement fix (feat/order: atomic stock decrement
// using guarded updateMany) to be deployed. Without the fix, concurrent orders
// can all succeed and stock goes negative.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Stock race condition — atomic decrement', () => {

  test('only one of two concurrent orders for stock=1 product succeeds', async () => {
    const { variantId, adminToken } = await setupRaceProduct();
    const token = await customerToken();

    // Fire both requests simultaneously — Promise.all dispatches both before
    // awaiting either, exercising the true concurrent-write race at the DB level.
    const [r1, r2] = await Promise.all([
      placeOrder(token, variantId),
      placeOrder(token, variantId),
    ]);

    const successes = [r1, r2].filter(r => r.status >= 200 && r.status < 300);
    const failures = [r1, r2].filter(r => r.status >= 400);

    // Exactly one order should be created
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // Failure must be either 400 (app-layer "Insufficient stock") or 409/422.
    // A 500 here means the DB CHECK constraint caught it — which is the safety
    // net working, but indicates the app layer didn't catch it first.
    // Both 400 and 500 mean no second order was created; the key invariant is stock=0.
    expect(failures[0].status).toBeGreaterThanOrEqual(400);

    // Stock must be exactly 0 — not -1 (which would indicate the guard failed entirely)
    const stockAfter = await getVariantStock(variantId, adminToken);
    expect(stockAfter).toBe(0);
  });

  test('three concurrent orders for stock=1 product: exactly one succeeds', async () => {
    const { variantId, adminToken } = await setupRaceProduct();
    const token = await customerToken();

    const results = await Promise.all([
      placeOrder(token, variantId),
      placeOrder(token, variantId),
      placeOrder(token, variantId),
    ]);

    const successes = results.filter(r => r.status >= 200 && r.status < 300);
    const failures = results.filter(r => r.status >= 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(2);

    // Stock must never go below 0
    const stockAfter = await getVariantStock(variantId, adminToken);
    expect(stockAfter).toBe(0);
  });

  test('stock never goes negative regardless of concurrency (DB CHECK constraint)', async () => {
    const { variantId, adminToken } = await setupRaceProduct();
    const token = await customerToken();

    // Fire 5 concurrent requests — even if the app-layer guard had a gap,
    // the CHECK (stock >= 0) constraint is the hard stop.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => placeOrder(token, variantId)),
    );

    const successes = results.filter(r => r.status >= 200 && r.status < 300);
    // stock=1 means at most 1 can succeed
    expect(successes.length).toBeLessThanOrEqual(1);

    const stockAfter = await getVariantStock(variantId, adminToken);
    // The hard invariant: stock never goes negative
    expect(stockAfter).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-store oversell protection
//
// Phase-2c: each store gets its own stock budget via StoreVariantOverride.
// Exhausting store S's override must not affect the default store's variant.stock
// — the two inventories are independent.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Per-store oversell protection — StoreVariantOverride', () => {
  let variantId: number;
  let storeS: number;

  test.beforeAll(async () => {
    const setup = await setupStoreOverrideProduct();
    variantId = setup.variantId;
    storeS = setup.storeS;
  });

  test.afterAll(() => {
    // Remove the test store; StoreVariantOverride rows cascade-delete via FK.
    deleteTestStore(storeS);
  });

  test(
    'concurrent orders at store S (StoreVariantOverride stock=1): exactly one succeeds, one fails with insufficient stock',
    async () => {
      const token = await customerToken();

      // Two orders race for the single override unit at store S.
      const [rS1, rS2] = await Promise.all([
        placeOrderAtStore(token, variantId, storeS),
        placeOrderAtStore(token, variantId, storeS),
      ]);

      const sSuccesses = [rS1, rS2].filter(r => r.status >= 200 && r.status < 300);
      const sFailures = [rS1, rS2].filter(r => r.status >= 400);

      expect(sSuccesses, 'exactly one store-S order must succeed').toHaveLength(1);
      expect(sFailures, 'exactly one store-S order must fail').toHaveLength(1);
      // 400 = app-layer "Insufficient stock"; 500 = DB CHECK caught it — either
      // means no double-sell occurred.
      expect(sFailures[0].status).toBeGreaterThanOrEqual(400);
    },
  );

  test(
    'concurrent order at DEFAULT store for same variant succeeds (independent inventory)',
    async () => {
      // Store S override is now exhausted (from the previous test); the default
      // store still has variant.stock=5 and must be unaffected.
      const token = await customerToken();
      // No X-Store-Id header → resolves to the default store → uses variant.stock.
      const rDef = await placeOrder(token, variantId);

      expect(
        rDef.status,
        'default-store order must succeed regardless of store-S stock state',
      ).toBeGreaterThanOrEqual(200);
      expect(rDef.status).toBeLessThan(300);
    },
  );
});
