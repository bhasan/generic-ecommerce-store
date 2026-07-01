// web/src/context/StoreSelectionContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStores } from '../services/storesApi';
import { useAuthContext } from './AuthContext';
import { getUserRoles, ROLES } from '../utils/roles';

const StoreSelectionContext = createContext(null);

export const useStoreSelection = () => {
  const ctx = useContext(StoreSelectionContext);
  if (!ctx) throw new Error('useStoreSelection must be used within StoreSelectionProvider');
  return ctx;
};

export function StoreSelectionProvider({ children }) {
  const { isLoading, isAuthenticated, currentUser } = useAuthContext();
  const [stores, setStores] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until auth resolution is complete before touching the auth-gated endpoint.
    if (isLoading) return;

    // Guest (unauthenticated): the store list endpoint requires auth.
    // Set a safe empty state so loading never hangs forever for guests.
    if (!isAuthenticated) {
      setStores([]);
      setActiveStoreId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const list = await getStores();
        if (cancelled) return;

        const safeList = Array.isArray(list) ? list : [];
        setStores(safeList);

        const persisted = localStorage.getItem('selectedStoreId');
        const persistedId = persisted ? Number(persisted) : null;

        const isAdmin = getUserRoles(currentUser).includes(ROLES.ADMIN);

        if (safeList.length === 1) {
          // Auto-select the only store
          setActiveStoreId(safeList[0].id);
          localStorage.setItem('selectedStoreId', String(safeList[0].id));
        } else if (persistedId === 0 && !isAdmin) {
          // 0 is the admin-only "All stores" sentinel. A non-admin inherited it
          // (e.g. a customer on a shared/POS browser where an admin picked All
          // stores) — treat it as invalid: clear it so single-store auto-selects
          // and multi-store shows the picker, instead of forwarding X-Store-Id: 0
          // (which 400s every checkout with no in-UI way to clear it).
          localStorage.removeItem('selectedStoreId');
          setActiveStoreId(null);
        } else if (persistedId !== null && (persistedId === 0 || safeList.some((s) => s.id === persistedId))) {
          // Restore valid persisted selection — 0 is the admin "All stores" sentinel
          setActiveStoreId(persistedId);
        } else {
          // Clear stale persisted id
          if (persisted !== null) {
            localStorage.removeItem('selectedStoreId');
          }
          setActiveStoreId(null);
        }
      } catch {
        if (!cancelled) {
          setStores([]);
          setActiveStoreId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isLoading, isAuthenticated, currentUser]);

  const selectStore = useCallback((id) => {
    setActiveStoreId(id);
    if (id === null || id === undefined) {
      localStorage.removeItem('selectedStoreId');
    } else {
      localStorage.setItem('selectedStoreId', String(id));
    }
  }, []);

  const isMultiStore = stores.length > 1;

  const value = { stores, activeStoreId, isMultiStore, selectStore, loading };

  return (
    <StoreSelectionContext.Provider value={value}>
      {children}
    </StoreSelectionContext.Provider>
  );
}
