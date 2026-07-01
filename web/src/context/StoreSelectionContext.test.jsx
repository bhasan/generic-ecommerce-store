// web/src/context/StoreSelectionContext.test.jsx
import { useState } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { StoreSelectionProvider, useStoreSelection } from './StoreSelectionContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/storesApi', () => ({ getStores: vi.fn() }));

// Default: authenticated user so existing tests exercise the fetch path.
vi.mock('./AuthContext', () => ({
  useAuthContext: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
}));

import * as storesApi from '../services/storesApi';
import { useAuthContext } from './AuthContext';
import { ROLES } from '../utils/roles';

const wrapper = ({ children }) => (
  <StoreSelectionProvider>{children}</StoreSelectionProvider>
);

describe('StoreSelectionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset to the authenticated default after each test.
    useAuthContext.mockReturnValue({ isLoading: false, isAuthenticated: true });
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

  it('(e) guest (isAuthenticated=false) → getStores not called, isMultiStore=false, activeStoreId=null, loading=false', async () => {
    useAuthContext.mockReturnValue({ isLoading: false, isAuthenticated: false });

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(storesApi.getStores).not.toHaveBeenCalled();
    expect(result.current.isMultiStore).toBe(false);
    expect(result.current.activeStoreId).toBeNull();
    expect(result.current.stores).toHaveLength(0);
  });

  it('(f) ADMIN with persisted selectedStoreId="0" (All-stores sentinel) is retained, not cleared', async () => {
    localStorage.setItem('selectedStoreId', '0');
    useAuthContext.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      currentUser: { id: 1, username: 'root', roles: [ROLES.ADMIN] },
    });

    storesApi.getStores.mockResolvedValue([
      { id: 1, name: 'Store A', slug: 'store-a', isDefault: true },
      { id: 2, name: 'Store B', slug: 'store-b', isDefault: false },
    ]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 0 is the admin All-stores sentinel — must be kept for admins, not cleared
    expect(result.current.activeStoreId).toBe(0);
    expect(localStorage.getItem('selectedStoreId')).toBe('0');
  });

  it('(g) NON-admin with persisted selectedStoreId="0" → invalid → cleared, activeStoreId null', async () => {
    localStorage.setItem('selectedStoreId', '0');
    // Default mock (from beforeEach) is a non-admin authenticated user.
    useAuthContext.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      currentUser: { id: 2, username: 'customer', roles: [ROLES.CUSTOMER] },
    });

    storesApi.getStores.mockResolvedValue([
      { id: 1, name: 'Store A', slug: 'store-a', isDefault: true },
      { id: 2, name: 'Store B', slug: 'store-b', isDefault: false },
    ]);

    const { result } = renderHook(() => useStoreSelection(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The admin-only All-stores sentinel must NOT stick for a non-admin:
    // clear it so multi-store shows the picker (and single-store auto-selects).
    expect(result.current.activeStoreId).toBeNull();
    expect(localStorage.getItem('selectedStoreId')).toBeNull();
  });

  it('(h) context value is referentially stable across an unrelated parent re-render', async () => {
    storesApi.getStores.mockResolvedValue([{ id: 1, name: 'Store A', slug: 'store-a', isDefault: true }]);

    let forceRerender;
    function Harness({ children }) {
      const [, setTick] = useState(0);
      forceRerender = () => setTick((t) => t + 1);
      return <StoreSelectionProvider>{children}</StoreSelectionProvider>;
    }

    const { result } = renderHook(() => useStoreSelection(), { wrapper: Harness });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const first = result.current;

    // Trigger a re-render of the tree via unrelated state, with no change to
    // stores/activeStoreId/isMultiStore/selectStore/loading.
    act(() => {
      forceRerender();
    });

    expect(result.current).toBe(first);
  });

  it('throws when used outside StoreSelectionProvider', () => {
    expect(() => renderHook(() => useStoreSelection())).toThrow(
      'useStoreSelection must be used within StoreSelectionProvider'
    );
  });
});
