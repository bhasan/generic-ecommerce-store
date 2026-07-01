import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: { findFirst: vi.fn(), upsert: vi.fn() },
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
