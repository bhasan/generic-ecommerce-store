// web/src/features/store/StoreSwitcher.jsx
import React, { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useStoreSelection } from '../../context/StoreSelectionContext';
import './StoreSwitcher.css';

/**
 * Header control shown only for multi-store tenants.
 * Displays the active store name and lets the customer switch to another store.
 * Renders nothing for single-store tenants.
 */
function StoreSwitcher() {
  const { stores, activeStoreId, isMultiStore, selectStore } = useStoreSelection();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Hide for single-store tenants
  if (!isMultiStore) return null;

  const activeStore = stores.find((s) => s.id === activeStoreId);

  const handleSelect = (id) => {
    selectStore(id);
    setOpen(false);
  };

  return (
    <div className="store-switcher" ref={containerRef}>
      <button
        className="store-switcher-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={activeStore ? `Current store: ${activeStore.name}. Click to change.` : 'Choose store'}
        type="button"
      >
        <MapPin size={14} className="store-switcher-icon" aria-hidden="true" />
        <span className="store-switcher-label">
          {activeStore ? activeStore.name : 'Choose store'}
        </span>
        <ChevronDown size={14} className={`store-switcher-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="store-switcher-dropdown" role="listbox" aria-label="Select store">
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
