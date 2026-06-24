import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useProducts from './useProducts';

const mockProducts = [
  { id: 1, name: 'Product A', sortOrder: 1, categoryId: 10, category: { id: 10 } },
  { id: 2, name: 'Product B', sortOrder: 0, categoryId: 10, category: { id: 10 } },
];
const mockCategories = [
  { id: 10, name: 'Cat 1', parentId: null, sortOrder: 0 },
  { id: 11, name: 'Cat 2', parentId: 10, sortOrder: 0 },
];

const loadProductsMock = vi.fn();
vi.mock('../../../context/AppContext', () => ({
  useApp: () => ({
    currentUser: { roles: ['ADMIN'] },
    products: mockProducts,
    isLoadingProducts: false,
    loadProducts: loadProductsMock,
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    categories: mockCategories,
    isLoadingCategories: false,
    loadCategories: vi.fn(),
    showNotification: vi.fn(),
  }),
}));

describe('useProducts', () => {
  beforeEach(() => { loadProductsMock.mockReset(); });

  it('calls loadProducts on mount', () => {
    renderHook(() => useProducts());
    expect(loadProductsMock).toHaveBeenCalledTimes(1);
  });

  it('returns products sorted by sortOrder', () => {
    const { result } = renderHook(() => useProducts());
    expect(result.current.orderedProducts[0].id).toBe(2); // sortOrder 0 first
    expect(result.current.orderedProducts[1].id).toBe(1); // sortOrder 1 second
  });

  it('groups products by categoryId', () => {
    const { result } = renderHook(() => useProducts());
    expect(result.current.productsByCategory[10]).toHaveLength(2);
  });

  it('separates top-level and child categories', () => {
    const { result } = renderHook(() => useProducts());
    expect(result.current.topLevelCategories).toHaveLength(1);
    expect(result.current.topLevelCategories[0].id).toBe(10);
    expect(result.current.childCategoriesByParent[10]).toHaveLength(1);
    expect(result.current.childCategoriesByParent[10][0].id).toBe(11);
  });
});
