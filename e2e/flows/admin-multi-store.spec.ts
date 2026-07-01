/**
 * e2e/flows/admin-multi-store.spec.ts
 *
 * Phase-2e Task 7 — Admin multi-store operations
 *
 * Proves:
 *   1. Admin store management  — create a 2nd store, clone-from-default seeds it from
 *                                 the base catalog, appear in /manage.
 *   2. Admin switcher (API)    — X-Store-Id header filters orders to one store;
 *                                 X-Store-Id: 0 ("All stores") aggregates across stores.
 *   3. Staff-store constraint  — a staff member scoped to store A is denied (403) at
 *                                 store B and allowed (200) at store A.
 *
 * Completely API-driven (Playwright `request` contexts). No browser storefront usage,
 * so a transient 2nd store cannot affect concurrent browser flows in sibling specs.
 */

import { test, expect, request } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import {
  getDefaultTenantId,
  deleteTestStore,
} from '../helpers/db';

const API = 'http://localhost:3000';

// ── shared state ──────────────────────────────────────────────────────────────

let adminToken: string;
let customerToken: string;

let tenantId: number;
let defaultStoreId: number;
let storeBId: number;
let storeBCreationStatus: number;

let variantId: number;       // test variant — stockEnabled:false (no stock decrement needed)

let managerId: number;

let orderAId: number;        // order placed at the default store
let orderBId: number;        // order placed at store B

// ── helpers ───────────────────────────────────────────────────────────────────

async function loginAs(username: string, password: string): Promise<string> {
  const ctx = await request.newContext();
  const body = await (
    await ctx.post(`${API}/api/auth/login`, { data: { username, password } })
  ).json();
  await ctx.dispose();
  const token = body?.data?.token;
  if (!token) throw new Error(`Login failed for ${username}: ${JSON.stringify(body)}`);
  return token as string;
}

async function placeOrderAtStore(
  token: string,
  vid: number,
  storeIdHeader?: number,
): Promise<{ status: number; id: number }> {
  const ctx = await request.newContext();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (storeIdHeader !== undefined) headers['x-store-id'] = String(storeIdHeader);

  const res = await ctx.post(`${API}/api/orders`, {
    headers,
    data: {
      items: [{ variantId: vid, quantity: 1 }],
      deliveryMethod: 'PICKUP',
      paymentMethod: 'IN_STORE',
    },
  });
  const body = await res.json();
  await ctx.dispose();

  if (res.status() < 200 || res.status() >= 300) {
    throw new Error(
      `placeOrderAtStore(storeId=${storeIdHeader}) failed ${res.status()}: ${JSON.stringify(body)}`,
    );
  }
  // createOrder returns { data: { order: { id } } }
  const orderId = (body.data as { order?: { id: number }; id?: number }).order?.id
    ?? (body.data as { id?: number }).id;
  return { status: res.status(), id: orderId as number };
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

test.describe('Admin multi-store operations', () => {
  test.beforeAll(async () => {
    tenantId = getDefaultTenantId();

    // --- login -----------------------------------------------------------------
    adminToken = await loginAs(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    customerToken = await loginAs(ACCOUNTS.customer.username, ACCOUNTS.customer.password);

    // --- get default store id --------------------------------------------------
    const ctx = await request.newContext();

    const storesBody = await (
      await ctx.get(`${API}/api/stores/manage`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const stores = (storesBody.data as Array<{ id: number; isDefault: boolean }>);
    const defaultStore = stores.find((s) => s.isDefault);
    if (!defaultStore) throw new Error('No default store found in /api/stores/manage');
    defaultStoreId = defaultStore.id;

    // --- create store B --------------------------------------------------------
    const storeBSlug = `e2e-store-b-${Date.now()}`;
    const storeBRes = await ctx.post(`${API}/api/stores`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `E2E Store B ${Date.now()}`, slug: storeBSlug },
    });
    storeBCreationStatus = storeBRes.status();
    const storeBBody = await storeBRes.json();
    storeBId = (storeBBody.data as { id: number }).id;

    // --- create test product (stockEnabled:false → no stock decrement) ---------
    const catsBody = await (
      await ctx.get(`${API}/api/categories`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const cats = Array.isArray(catsBody) ? catsBody : catsBody.data;
    const catId = (cats as Array<{ id: number }>)[0].id;

    const prodBody = await (
      await ctx.post(`${API}/api/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: `Multi-Store E2E Product ${Date.now()}`,
          categoryId: catId,
          images: [],
          variants: [
            {
              label: 'Default',
              basePrice: 5.0,
              stock: 0,
              stockEnabled: false,   // no stock gating — order at any store works
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
    variantId = (
      prodBody.data.product as { variants: Array<{ id: number }> }
    ).variants[0].id;

    // --- find manager user id --------------------------------------------------
    const usersBody = await (
      await ctx.get(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const users = Array.isArray(usersBody) ? usersBody : usersBody.data;
    const managerUser = (users as Array<{ id: number; username: string }>).find(
      (u) => u.username === ACCOUNTS.manager.username,
    );
    if (!managerUser) throw new Error(`Manager account '${ACCOUNTS.manager.username}' not found`);
    managerId = managerUser.id;

    await ctx.dispose();

    // --- place orders for switcher tests (Step 2) ------------------------------
    // Order A: at the DEFAULT store (no X-Store-Id header → resolves to default)
    const { id: oid } = await placeOrderAtStore(customerToken, variantId);
    orderAId = oid;

    // Order B: at store B (X-Store-Id = storeBId)
    const { id: obid } = await placeOrderAtStore(customerToken, variantId, storeBId);
    orderBId = obid;
  });

  test.afterAll(async () => {
    // Unconditional cleanup — preserves shared-account state for future runs.
    const ctx = await request.newContext();

    // 1. Restore manager to all-stores (even if test 3 didn't run / failed).
    if (managerId && adminToken) {
      await ctx.put(`${API}/api/users/${managerId}/store-roles`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { assignments: [{ roleName: 'MANAGEMENT', storeIds: 'all' }] },
      });
    }

    await ctx.dispose();

    // 2. Delete store B. Its StoreVariantOverride rows (incl. the base-catalog seed
    //    from clone-from-default) cascade-delete via FK.
    //    Orders at store B have no FK to stores (storeId is a plain Int? — no onDelete);
    //    those rows remain but are tenant-isolated and harmless.
    if (storeBId) {
      deleteTestStore(storeBId);
    }
  });

  // ── Step 1: Admin store management ─────────────────────────────────────────

  test('1a — POST /api/stores creates store B (201) and it appears in GET /api/stores/manage', async () => {
    // Creation happened in beforeAll; assert status code and presence in /manage.
    expect(storeBCreationStatus, 'store creation should return 201').toBe(201);

    const ctx = await request.newContext();
    const body = await (
      await ctx.get(`${API}/api/stores/manage`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    await ctx.dispose();

    const stores = body.data as Array<{ id: number; name: string }>;
    const found = stores.find((s) => s.id === storeBId);
    expect(found, `store B (id=${storeBId}) must appear in /api/stores/manage`).toBeTruthy();
  });

  test('1b — POST /api/stores/:B/clone-from-default seeds store B from the base catalog', async () => {
    const ctx = await request.newContext();

    // Read the variant's BASE (tenant-wide) stock/price BEFORE cloning, via the
    // admin-only base scope (Phase-2e Task 6 fix) — so the post-clone assertion
    // checks against the real base value, not a magic number.
    const baseProductsRes = await ctx.get(`${API}/api/products?scope=base`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const baseProductsBody = await baseProductsRes.json();
    const baseProducts = Array.isArray(baseProductsBody) ? baseProductsBody : baseProductsBody.data;
    const baseVariant = (baseProducts as Array<{ variants: Array<{ id: number; stock: number }> }>)
      .flatMap((p) => p.variants)
      .find((v) => v.id === variantId);
    expect(baseVariant, 'base-scope read must include the test variant').toBeTruthy();

    // Trigger clone.
    const cloneRes = await ctx.post(`${API}/api/stores/${storeBId}/clone-from-default`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const cloneBody = await cloneRes.json();
    expect(
      cloneRes.status(),
      `clone-from-default should return 200, got: ${JSON.stringify(cloneBody)}`,
    ).toBe(200);
    expect(
      (cloneBody.data as { overridesCopied: number }).overridesCopied,
      'clone should seed an override for every tenant variant (at least the one under test)',
    ).toBeGreaterThanOrEqual(1);

    // Verify store B now has a base-catalog-seeded override for the test variant:
    // stock matches the BASE variant's stock, and price/active are left null (inherit).
    const overridesRes = await ctx.get(
      `${API}/api/store-overrides?storeId=${storeBId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const overridesBody = await overridesRes.json();
    expect(overridesRes.status()).toBe(200);

    const overrides = (
      overridesBody.data as {
        overrides: Array<{ variantId: number; stock: number; priceOverride: number | null; activeOverride: boolean | null }>;
      }
    ).overrides;
    const cloned = overrides.find((ov) => ov.variantId === variantId);
    expect(
      cloned,
      `store B must have a StoreVariantOverride for variantId=${variantId} after clone-from-default`,
    ).toBeTruthy();
    expect(cloned?.stock, 'cloned stock must match the base variant stock (seed-from-base)').toBe(baseVariant!.stock);
    expect(cloned?.priceOverride, 'cloned priceOverride must be null (inherits base price + breaks)').toBeNull();
    expect(cloned?.activeOverride, 'cloned activeOverride must be null (inherits base active)').toBeNull();

    await ctx.dispose();
  });

  // ── Step 2: Admin switcher filter / aggregate ───────────────────────────────

  test('2a — GET /api/orders with X-Store-Id=defaultStore returns order A but not order B', async () => {
    const ctx = await request.newContext();
    const body = await (
      await ctx.get(`${API}/api/orders`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-store-id': String(defaultStoreId),
        },
      })
    ).json();
    await ctx.dispose();

    const orders = body.data as Array<{ id: number }>;
    const ids = orders.map((o) => o.id);

    expect(ids, 'default-store view must include order A').toContain(orderAId);
    expect(ids, 'default-store view must NOT include order B').not.toContain(orderBId);
  });

  test('2b — GET /api/orders with X-Store-Id=storeBId returns order B but not order A', async () => {
    const ctx = await request.newContext();
    const body = await (
      await ctx.get(`${API}/api/orders`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-store-id': String(storeBId),
        },
      })
    ).json();
    await ctx.dispose();

    const orders = body.data as Array<{ id: number }>;
    const ids = orders.map((o) => o.id);

    expect(ids, 'store-B view must include order B').toContain(orderBId);
    expect(ids, 'store-B view must NOT include order A').not.toContain(orderAId);
  });

  test('2c — GET /api/orders with X-Store-Id=0 (All Stores) returns both orders', async () => {
    const ctx = await request.newContext();
    const body = await (
      await ctx.get(`${API}/api/orders`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-store-id': '0',
        },
      })
    ).json();
    await ctx.dispose();

    const orders = body.data as Array<{ id: number }>;
    const ids = orders.map((o) => o.id);

    expect(ids, 'All-stores view must include order A').toContain(orderAId);
    expect(ids, 'All-stores view must include order B').toContain(orderBId);
  });

  // ── Step 3: Staff-store constraint ─────────────────────────────────────────
  //
  // Route used: GET /api/orders/ready-for-delivery
  //   → authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER')
  //   → role middleware checks req.store?.id (from X-Store-Id) against the JWT
  //     storeId baked into the user's MANAGEMENT role at login.
  //
  // Flow:
  //   a) Admin restricts manager to store A (defaultStoreId) via PUT /api/users/:id/store-roles.
  //   b) Manager logs in FRESH → token captures storeId=A in the MANAGEMENT role.
  //   c) X-Store-Id=storeBId → actingStore=B ≠ roleStoreId=A → 403.
  //   d) X-Store-Id=defaultStoreId → actingStore=A = roleStoreId=A → 200.
  //   afterAll restores manager to all-stores ('all').

  test('3 — staff scoped to store A: X-Store-Id=B returns 403, X-Store-Id=A returns 200', async () => {
    const ctx = await request.newContext();

    // a) Reassign manager to default store (store A) only.
    const assignRes = await ctx.put(`${API}/api/users/${managerId}/store-roles`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        assignments: [{ roleName: 'MANAGEMENT', storeIds: [defaultStoreId] }],
      },
    });
    expect(
      assignRes.status(),
      `store-role assignment should succeed, got: ${await assignRes.text()}`,
    ).toBe(200);

    // b) Login manager FRESH — JWT bakes storeId=defaultStoreId into the MANAGEMENT role.
    const freshToken = await loginAs(ACCOUNTS.manager.username, ACCOUNTS.manager.password);

    // c) Request with X-Store-Id=storeBId → role at A ≠ acting store B → 403.
    const denyRes = await ctx.get(`${API}/api/orders/ready-for-delivery`, {
      headers: {
        Authorization: `Bearer ${freshToken}`,
        'x-store-id': String(storeBId),
      },
    });
    expect(
      denyRes.status(),
      `manager scoped to store A must be denied (403) at store B (id=${storeBId})`,
    ).toBe(403);

    // d) Request with X-Store-Id=defaultStoreId → role at A = acting store A → 200.
    const allowRes = await ctx.get(`${API}/api/orders/ready-for-delivery`, {
      headers: {
        Authorization: `Bearer ${freshToken}`,
        'x-store-id': String(defaultStoreId),
      },
    });
    expect(
      allowRes.status(),
      `manager scoped to store A must be allowed (200) at store A (id=${defaultStoreId})`,
    ).toBe(200);

    await ctx.dispose();
    // afterAll restores manager to 'all' regardless of test outcome.
  });
});
