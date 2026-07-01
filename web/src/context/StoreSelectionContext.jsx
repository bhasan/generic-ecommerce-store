// web/src/context/StoreSelectionContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStores } from '../services/storesApi';

const StoreSelectionContext = createContext(null);

export const useStoreSelection = () => {
  const ctx = useContext(StoreSelectionContext);
  if (!ctx) throw new Error('useStoreSelection must be used within StoreSelectionProvider');
  return ctx;
};

export function StoreSelectionProvider({ children }) {
  const [stores, setStores] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await getStores();
        if (cancelled) return;

        const safeList = Array.isArray(list) ? list : [];
        setStores(safeList);

        const persisted = localStorage.getItem('selectedStoreId');
        const persistedId = persisted ? Number(persisted) : null;

        if (safeList.length === 1) {
          // Auto-select the only store
          setActiveStoreId(safeList[0].id);
          localStorage.setItem('selectedStoreId', String(safeList[0].id));
        } else if (persistedId !== null && safeList.some((s) => s.id === persistedId)) {
          // Restore valid persisted selection
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
  }, []);

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
