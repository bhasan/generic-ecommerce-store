// web/src/context/StoreSelectionContext.test.jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { StoreSelectionProvider, useStoreSelection } from './StoreSelectionContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/storesApi', () => ({ getStores: vi.fn() }));

import * as storesApi from '../services/storesApi';

const wrapper = ({ children }) => (
  <StoreSelectionProvider>{children}</StoreSelectionProvider>
);

describe('StoreSelectionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('(a) single store → auto-selected, isMultiStore=false', async () => {
    storesApi.getStores.mockResolvedValue([{ id: 1, name: 'Store A', slug: 'store-a', isDefault: true }]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeStoreId).toBe(1);
    expect(result.current.isMultiStore).toBe(false);
    expect(result.current.stores).toHaveLength(1);
  });

  it('(b) multiple stores + no persisted id → activeStoreId=null, isMultiStore=true', async () => {
    storesApi.getStores.mockResolvedValue([
      { id: 1, name: 'Store A', slug: 'store-a', isDefault: true },
      { id: 2, name: 'Store B', slug: 'store-b', isDefault: false },
    ]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeStoreId).toBeNull();
    expect(result.current.isMultiStore).toBe(true);
    expect(result.current.stores).toHaveLength(2);
  });

  it('(c) selectStore(id) sets activeStoreId and writes localStorage', async () => {
    storesApi.getStores.mockResolvedValue([
      { id: 1, name: 'Store A', slug: 'store-a', isDefault: false },
      { id: 2, name: 'Store B', slug: 'store-b', isDefault: false },
    ]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectStore(2);
    });

    expect(result.current.activeStoreId).toBe(2);
    expect(localStorage.getItem('selectedStoreId')).toBe('2');
  });

  it('(d) a persisted id not in the returned list is cleared', async () => {
    localStorage.setItem('selectedStoreId', '99');

    storesApi.getStores.mockResolvedValue([
      { id: 1, name: 'Store A', slug: 'store-a', isDefault: true },
      { id: 2, name: 'Store B', slug: 'store-b', isDefault: false },
    ]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeStoreId).toBeNull();
    expect(localStorage.getItem('selectedStoreId')).toBeNull();
  });

  it('throws when used outside StoreSelectionProvider', () => {
    expect(() => renderHook(() => useStoreSelection())).toThrow(
      'useStoreSelection must be used within StoreSelectionProvider'
    );
  });
});
