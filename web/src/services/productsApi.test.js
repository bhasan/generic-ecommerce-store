import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  get: vi.fn(() => Promise.resolve([])),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

import { get } from './api';
import { searchProducts } from './productsApi';

describe('searchProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the search endpoint with the encoded query and default pagination', async () => {
    await searchProducts('blue dream');
    expect(get).toHaveBeenCalledWith('/products/search?q=blue%20dream&limit=50&offset=0');
  });

  it('forwards custom limit and offset', async () => {
    await searchProducts('kush', { limit: 10, offset: 20 });
    expect(get).toHaveBeenCalledWith('/products/search?q=kush&limit=10&offset=20');
  });

  it('encodes special characters in the query', async () => {
    await searchProducts('pre-roll & flower');
    expect(get).toHaveBeenCalledWith(
      `/products/search?q=${encodeURIComponent('pre-roll & flower')}&limit=50&offset=0`,
    );
  });
});
