import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../config/database', () => ({ default: prismaMock }));

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
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    const result = await store.read();
    expect(result).toEqual(defaults);
    expect(result).not.toBe(defaults);
  });

  it('shallow-merges stored value over defaults', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({ value: { a: 'stored' } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    expect(await store.read()).toEqual({ a: 'stored', n: 0 });
  });

  it('runs onRead transform', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({ value: { a: 'x', n: 1 } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k', schema, defaults,
      onRead: (raw) => ({ ...raw, a: raw.a.toUpperCase() }),
    });
    expect((await store.read()).a).toBe('X');
  });

  it('validates and upserts on write, returning plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    const data = { a: 'hi', n: 2 };
    const result = await store.write(data);
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'k' },
      update: { value: data },
      create: { key: 'k', value: data },
    });
    expect(result).toEqual(data);
  });

  it('runs onWrite transform before persisting but returns plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k', schema, defaults,
      onWrite: (data) => ({ ...data, a: `enc:${data.a}` }),
    });
    const result = await store.write({ a: 'secret', n: 1 });
    const persisted = prismaMock.uiSetting.upsert.mock.calls[0][0].update.value;
    expect(persisted.a).toBe('enc:secret');
    expect(result.a).toBe('secret');
  });

  it('resolves defaults from a factory fresh on each read (no row)', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { SettingsStore } = await import('./settingsStore');
    let counter = 0;
    const store = new SettingsStore({
      key: 'k', schema, defaults: () => ({ a: `gen${++counter}`, n: 0 }),
    });
    expect((await store.read()).a).toBe('gen1');
    expect((await store.read()).a).toBe('gen2');
  });

  it('throws AppError(400) on schema validation failure', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    await expect(store.write({ a: 123, n: 'no' } as never)).rejects.toBeInstanceOf(AppError);
  });
});
