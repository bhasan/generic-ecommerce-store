import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProducts = [
  { id: 1, name: 'Product A', sortOrder: 1, categoryId: 10, category: { id: 10 } },
  { id: 2, name: 'Product B', sortOrder: 0, categoryId: 10, category: { id: 10 } },
];
const mockCategories = [
  { id: 10, name: 'Cat 1', parentId: null, sortOrder: 0 },
  { id: 11, name: 'Cat 2', parentId: 10, sortOrder: 0 },
];

vi.mock('../../../context/AppContext', () => ({
  useApp: () => ({
    currentUser: { roles: ['ADMIN'] },
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    categories: mockCategories,
    isLoadingCategories: false,
    loadCategories: vi.fn(),
    showNotification: vi.fn(),
  }),
}));

// The management screen must read BASE (un-overridden) values, so it fetches its
// own base-scoped product list instead of the shared (store-effective) catalog.
const getAllProductsMock = vi.fn();
vi.mock('../../../services/productsApi', () => ({
  getAllProducts: (...args) => getAllProductsMock(...args),
}));

import useProducts from './useProducts';

describe('useProducts', () => {
  beforeEach(() => {
    getAllProductsMock.mockReset();
    getAllProductsMock.mockResolvedValue(mockProducts);
  });

  it('fetches BASE-scoped products on mount so the editor never reads store-effective values', async () => {
    renderHook(() => useProducts());
    await waitFor(() => expect(getAllProductsMock).toHaveBeenCalled());
    expect(getAllProductsMock).toHaveBeenCalledWith({ scope: 'base' });
  });

  it('returns products sorted by sortOrder', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.orderedProducts).toHaveLength(2));
    expect(result.current.orderedProducts[0].id).toBe(2); // sortOrder 0 first
    expect(result.current.orderedProducts[1].id).toBe(1); // sortOrder 1 second
  });

  it('groups products by categoryId', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.productsByCategory[10]).toHaveLength(2));
  });

  it('separates top-level and child categories', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.topLevelCategories).toHaveLength(1));
    expect(result.current.topLevelCategories[0].id).toBe(10);
    expect(result.current.childCategoriesByParent[10]).toHaveLength(1);
    expect(result.current.childCategoriesByParent[10][0].id).toBe(11);
  });
});
