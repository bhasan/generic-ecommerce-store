// web/src/features/store/StoreSwitcher.jsx
import React, { useState, useRef } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useStoreSelection } from '../../context/StoreSelectionContext';
import { useApp } from '../../context/AppContext';
import { getUserRoles, ROLES } from '../../utils/roles';
import './StoreSwitcher.css';

/**
 * Header control shown only for multi-store tenants.
 * Displays the active store name and lets the customer switch to another store.
 * Admins also see an "All stores" option that sends X-Store-Id: 0 for aggregate views.
 * Renders nothing for single-store tenants.
 */
function StoreSwitcher() {
  const { stores, activeStoreId, isMultiStore, selectStore } = useStoreSelection();
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Hide for single-store tenants
  if (!isMultiStore) return null;

  const isAdmin = getUserRoles(currentUser).includes(ROLES.ADMIN);

  // Derive the active label — 0 is falsy so must use strict equality
  const activeStore = activeStoreId === 0 ? null : stores.find((s) => s.id === activeStoreId);
  const activeLabel =
    activeStoreId === 0 ? 'All stores' : activeStore ? activeStore.name : 'Choose store';

  const handleSelect = (id) => {
    const changed = id !== activeStoreId;
    selectStore(id);
    setOpen(false);
    // Admins: force a full reload so mount-once dashboards (orders, reporting,
    // POS, print) re-fetch with the new X-Store-Id. Runs only when the store
    // actually changed. Non-admins keep the smooth in-place catalog/cart swap.
    if (isAdmin && changed) {
      window.location.reload();
    }
  };

  return (
    <div className="store-switcher" ref={containerRef}>
      <button
        className="store-switcher-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          activeStoreId === 0
            ? 'Current store: All stores. Click to change.'
            : activeStore
              ? `Current store: ${activeStore.name}. Click to change.`
              : 'Choose store'
        }
        type="button"
      >
        <MapPin size={14} className="store-switcher-icon" aria-hidden="true" />
        <span className="store-switcher-label">{activeLabel}</span>
        <ChevronDown size={14} className={`store-switcher-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="store-switcher-dropdown" role="listbox" aria-label="Select store">
          {isAdmin && (
            <button
              key="all-stores"
              className={`store-switcher-option${activeStoreId === 0 ? ' active' : ''}`}
              role="option"
              aria-selected={activeStoreId === 0}
              onClick={() => handleSelect(0)}
              type="button"
            >
              All stores
            </button>
          )}
          {stores.map((store) => (
            <button
              key={store.id}
              className={`store-switcher-option${store.id === activeStoreId ? ' active' : ''}`}
              role="option"
              aria-selected={store.id === activeStoreId}
              onClick={() => handleSelect(store.id)}
              type="button"
            >
              {store.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default StoreSwitcher;
