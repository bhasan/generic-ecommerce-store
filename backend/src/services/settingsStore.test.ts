import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../config/database', () => ({ default: prismaMock, getTenantPrisma: () => prismaMock, getUnscopedPrisma: () => prismaMock }));

const schema = z.object({ a: z.string(), n: z.number() });
const defaults = { a: 'def', n: 0 };

describe('parseOrThrow', () => {
  it('returns the parsed data when valid', async () => {
    const { parseOrThrow } = await import('./settingsStore');
    expect(parseOrThrow(schema, { a: 'ok', n: 1 })).toEqual({ a: 'ok', n: 1 });
  });

  it('throws AppError(400) carrying the first issue message', async () => {
    const { parseOrThrow } = await import('./settingsStore');
    const labelled = z.object({ a: z.string('a must be a string') });
    try {
      parseOrThrow(labelled, { a: 123 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toBe('a must be a string');
    }
  });
});

describe('SettingsStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a deep clone of defaults when no row exists', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue(null);
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k-defaults', schema, defaults });
    const result = await store.read();
    expect(result).toEqual(defaults);
    expect(result).not.toBe(defaults);
  });

  it('shallow-merges stored value over defaults', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'stored' } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k-merge', schema, defaults });
    expect(await store.read()).toEqual({ a: 'stored', n: 0 });
  });

  it('runs onRead transform', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'x', n: 1 } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k-onread', schema, defaults,
      onRead: (raw) => ({ ...raw, a: raw.a.toUpperCase() }),
    });
    expect((await store.read()).a).toBe('X');
  });

  it('validates and upserts on write, returning plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k-write', schema, defaults });
    const data = { a: 'hi', n: 2 };
    const result = await store.write(data);
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { tenantId_storeId_key: { tenantId: 0, storeId: 0, key: 'k-write' } },
      update: { value: data },
      create: { key: 'k-write', storeId: 0, value: data },
    });
    expect(result).toEqual(data);
  });

  it('runs onWrite transform before persisting but returns plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k-onwrite', schema, defaults,
      onWrite: (data) => ({ ...data, a: `enc:${data.a}` }),
    });
    const result = await store.write({ a: 'secret', n: 1 });
    const persisted = prismaMock.uiSetting.upsert.mock.calls[0][0].update.value;
    expect(persisted.a).toBe('enc:secret');
    expect(result.a).toBe('secret');
  });

  it('resolves defaults from a factory on first read and caches the result', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue(null);
    const { SettingsStore } = await import('./settingsStore');
    let counter = 0;
    const store = new SettingsStore({
      key: 'k-factory', schema, defaults: () => ({ a: `gen${++counter}`, n: 0 }),
    });
    expect((await store.read()).a).toBe('gen1');
    // second read hits cache; factory is NOT called again (TTL caching behaviour)
    expect((await store.read()).a).toBe('gen1');
  });

  it('throws AppError(400) on schema validation failure', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k-err', schema, defaults });
    await expect(store.write({ a: 123, n: 'no' } as never)).rejects.toBeInstanceOf(AppError);
  });

  it('reads from DB once then serves from cache for the same key', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'x', n: 1 } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'perf-cache', schema, defaults });
    await store.read();
    await store.read();
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns a fresh clone on cache hit (mutating the result does not poison the cache)', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'x', n: 1 } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'perf-clone', schema, defaults });
    const first = await store.read();
    (first as { a: string }).a = 'MUTATED';
    const second = await store.read();
    expect((second as { a: string }).a).toBe('x');
  });

  it('invalidates the cache on write', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'x', n: 1 } });
    prismaMock.uiSetting.upsert.mockResolvedValue({});
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'perf-inv', schema, defaults });
    await store.read();
    await store.write({ a: 'y', n: 2 });
    await store.read();
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(2);
  });

  it('caches per-tenant: tenant A cached value is never served to tenant B', async () => {
    const { runWithTenant } = await import('../config/tenantContext');
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'tenant-iso', schema, defaults });

    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'tenantA', n: 1 } });
    const a = await runWithTenant({ tenantId: 1, storeId: null, scope: 'tenant' }, () => store.read());
    expect(a.a).toBe('tenantA');

    // Tenant B: DB returns B's own value. B must NOT receive A's cached value.
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { a: 'tenantB', n: 2 } });
    const b = await runWithTenant({ tenantId: 2, storeId: null, scope: 'tenant' }, () => store.read());
    expect(b.a).toBe('tenantB');
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(2); // B did not hit A's cache

    // Re-reading A still serves A's cached value (and does not re-query).
    const a2 = await runWithTenant({ tenantId: 1, storeId: null, scope: 'tenant' }, () => store.read());
    expect(a2.a).toBe('tenantA');
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('store-scoped settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearSettingsCache } = await import('./settingsStore');
    clearSettingsCache();
  });

  it('merges tenant-default (storeId 0) with the active store override, override non-blank wins', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');

    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'default-a', b: 'default-b' } },
      { storeId: 9, value: { a: 'store-a', b: '' } }, // b blank → inherit
    ]);

    const result = await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await new SettingsStore<{ a: string; b: string }>({
        key: 'k-sscope-merge', storeScoped: true,
        schema: z.object({ a: z.string(), b: z.string() }),
        defaults: { a: '', b: '' },
      }).read(),
    );
    expect(result).toEqual({ a: 'store-a', b: 'default-b' });
  });

  it('inherits all fields from tenant-default when no store override row exists', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');

    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'default-a', b: 'default-b' } },
    ]);

    const result = await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await new SettingsStore<{ a: string; b: string }>({
        key: 'k-sscope-no-override', storeScoped: true,
        schema: z.object({ a: z.string(), b: z.string() }),
        defaults: { a: '', b: '' },
      }).read(),
    );
    expect(result).toEqual({ a: 'default-a', b: 'default-b' });
  });

  it('writes the tenant-default row (storeId 0) when the active store is the default', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');

    prismaMock.uiSetting.upsert.mockResolvedValue({});

    await runWithTenant(
      { tenantId: 7, storeId: 5, isDefaultStore: true, scope: 'tenant' },
      async () => await new SettingsStore<{ a: string; b: string }>({
        key: 'k', storeScoped: true,
        schema: z.object({ a: z.string(), b: z.string() }),
        defaults: { a: '', b: '' },
      }).write({ a: 'x', b: 'y' }),
    );
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_storeId_key: { tenantId: 7, storeId: 0, key: 'k' } },
    }));
  });

  it('writes the store override row when the active store is non-default', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');

    prismaMock.uiSetting.upsert.mockResolvedValue({});

    await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await new SettingsStore<{ a: string; b: string }>({
        key: 'k', storeScoped: true,
        schema: z.object({ a: z.string(), b: z.string() }),
        defaults: { a: '', b: '' },
      }).write({ a: 'x', b: 'y' }),
    );
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_storeId_key: { tenantId: 7, storeId: 9, key: 'k' } },
    }));
  });

  it('invalidates only the written store\'s own cache entry on a store-scoped write, not the whole cache', async () => {
    const { SettingsStore, clearSettingsCache } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');
    clearSettingsCache();

    const makeStoreWithKey = (key: string) => new SettingsStore<{ a: string; b: string }>({
      key, storeScoped: true,
      schema: z.object({ a: z.string(), b: z.string() }),
      defaults: { a: '', b: '' },
    });

    // Non-default store reads first → cache populated for this store.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v1', b: '' } },
    ]);
    await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await makeStoreWithKey('k-cacheclr').read(),
    );
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(1);

    // That same store writes its own override → invalidates only its own cache entry
    // (plus the tenant-default entry), not the entire process-wide cache.
    prismaMock.uiSetting.upsert.mockResolvedValue({});
    await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await makeStoreWithKey('k-cacheclr').write({ a: 'v2', b: '' }),
    );

    // Same store reads again → its own cache entry was invalidated, re-fetches DB.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v1', b: '' } },
      { storeId: 9, value: { a: 'v2', b: '' } },
    ]);
    const result = await runWithTenant(
      { tenantId: 7, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await makeStoreWithKey('k-cacheclr').read(),
    );
    expect(result.a).toBe('v2');
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(2); // re-fetched after own-entry invalidation
  });

  it('invalidates the tenant-default cache entry when the write targets the default store', async () => {
    const { SettingsStore, clearSettingsCache } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');
    clearSettingsCache();

    const makeStoreWithKey = (key: string) => new SettingsStore<{ a: string; b: string }>({
      key, storeScoped: true,
      schema: z.object({ a: z.string(), b: z.string() }),
      defaults: { a: '', b: '' },
    });

    // Default store reads first → cache populated for the tenant-default row.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v1', b: '' } },
    ]);
    await runWithTenant(
      { tenantId: 7, storeId: null, isDefaultStore: true, scope: 'tenant' },
      async () => await makeStoreWithKey('k-default-inv').read(),
    );
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(1);

    // Default store writes → invalidates the tenant-default (storeId 0) cache entry.
    prismaMock.uiSetting.upsert.mockResolvedValue({});
    await runWithTenant(
      { tenantId: 7, storeId: null, isDefaultStore: true, scope: 'tenant' },
      async () => await makeStoreWithKey('k-default-inv').write({ a: 'v2', b: '' }),
    );

    // Default store reads again → cache miss, re-fetches DB.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v2', b: '' } },
    ]);
    const result = await runWithTenant(
      { tenantId: 7, storeId: null, isDefaultStore: true, scope: 'tenant' },
      async () => await makeStoreWithKey('k-default-inv').read(),
    );
    expect(result.a).toBe('v2');
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not evict other tenants\' or other settings\' cached entries on a store-scoped write (the confirmed cross-tenant eviction finding)', async () => {
    const { SettingsStore, clearSettingsCache } = await import('./settingsStore');
    const { runWithTenant } = await import('../config/tenantContext');
    clearSettingsCache();

    // Tenant-scoped store (e.g. branding) for tenant A — NOT store-scoped.
    const tenantAStore = new SettingsStore<{ storeName: string }>({
      key: 'branding',
      schema: z.object({ storeName: z.string() }),
      defaults: { storeName: '' },
    });
    // Store-scoped store (e.g. store_settings) for tenant B.
    const tenantBStoreSettings = new SettingsStore<{ a: string; b: string }>({
      key: 'store_settings', storeScoped: true,
      schema: z.object({ a: z.string(), b: z.string() }),
      defaults: { a: '', b: '' },
    });

    // Warm tenant A's tenant-scoped cache entry.
    prismaMock.uiSetting.findFirst.mockResolvedValue({ value: { storeName: 'Tenant A Brand' } });
    await runWithTenant(
      { tenantId: 100, storeId: null, scope: 'tenant' },
      async () => await tenantAStore.read(),
    );
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(1);

    // Warm tenant B's store-scoped cache entry at a non-default store.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v1', b: '' } },
    ]);
    await runWithTenant(
      { tenantId: 200, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await tenantBStoreSettings.read(),
    );
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(1);

    // Tenant B writes their own store-scoped settings (non-default store).
    prismaMock.uiSetting.upsert.mockResolvedValue({});
    await runWithTenant(
      { tenantId: 200, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await tenantBStoreSettings.write({ a: 'v2', b: '' }),
    );

    // Tenant A's branding cache entry must STILL be warm — no extra DB hit.
    await runWithTenant(
      { tenantId: 100, storeId: null, scope: 'tenant' },
      async () => await tenantAStore.read(),
    );
    expect(prismaMock.uiSetting.findFirst).toHaveBeenCalledTimes(1); // unchanged: still a cache hit

    // Tenant B's own affected entry WAS invalidated: re-read reflects the new value.
    prismaMock.uiSetting.findMany.mockResolvedValue([
      { storeId: 0, value: { a: 'v1', b: '' } },
      { storeId: 9, value: { a: 'v2', b: '' } },
    ]);
    const resultB = await runWithTenant(
      { tenantId: 200, storeId: 9, isDefaultStore: false, scope: 'tenant' },
      async () => await tenantBStoreSettings.read(),
    );
    expect(resultB.a).toBe('v2');
    expect(prismaMock.uiSetting.findMany).toHaveBeenCalledTimes(2); // re-fetched after invalidation
  });
});
