import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  get: vi.fn(() => Promise.resolve('GET')),
  post: vi.fn(() => Promise.resolve({ id: 1 })),
  put: vi.fn(() => Promise.resolve({ id: 2 })),
  patch: vi.fn(() => Promise.resolve({ id: 3 })),
  del: vi.fn(() => Promise.resolve('DELETED')),
}));

import { get, post, put, patch, del } from './api';
import { createResourceApi } from './createResourceApi';

describe('createResourceApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll() hits the collection endpoint', async () => {
    await createResourceApi('/widgets', 'widget').getAll();
    expect(get).toHaveBeenCalledWith('/widgets');
  });

  it('getById() hits the item endpoint', async () => {
    await createResourceApi('/widgets', 'widget').getById(7);
    expect(get).toHaveBeenCalledWith('/widgets/7');
  });

  it('create() posts and returns the api.js-unwrapped response', async () => {
    const result = await createResourceApi('/widgets', 'widget').create({ name: 'x' });
    expect(post).toHaveBeenCalledWith('/widgets', { name: 'x' });
    expect(result).toEqual({ id: 1 });
  });

  it('update() puts and returns the api.js-unwrapped response', async () => {
    const result = await createResourceApi('/widgets', 'widget').update(2, { name: 'y' });
    expect(put).toHaveBeenCalledWith('/widgets/2', { name: 'y' });
    expect(result).toEqual({ id: 2 });
  });

  it('patch() patches and returns the api.js-unwrapped response', async () => {
    const result = await createResourceApi('/widgets', 'widget').patch(3, { name: 'z' });
    expect(patch).toHaveBeenCalledWith('/widgets/3', { name: 'z' });
    expect(result).toEqual({ id: 3 });
  });

  it('remove() deletes the item endpoint', async () => {
    const result = await createResourceApi('/widgets', 'widget').remove(9);
    expect(del).toHaveBeenCalledWith('/widgets/9');
    expect(result).toBe('DELETED');
  });
});
