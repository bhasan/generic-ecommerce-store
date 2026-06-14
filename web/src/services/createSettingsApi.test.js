import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  get: vi.fn(() => Promise.resolve({ ok: true })),
  put: vi.fn((_e, d) => Promise.resolve(d)),
}));

import { get, put } from './api';
import { createSettingsApi } from './createSettingsApi';

describe('createSettingsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get() calls GET on the endpoint', async () => {
    const api = createSettingsApi('/branding');
    expect(await api.get()).toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith('/branding');
  });

  it('update() calls PUT with data', async () => {
    const api = createSettingsApi('/branding');
    const data = { tagline: 'x' };
    expect(await api.update(data)).toEqual(data);
    expect(put).toHaveBeenCalledWith('/branding', data);
  });
});
