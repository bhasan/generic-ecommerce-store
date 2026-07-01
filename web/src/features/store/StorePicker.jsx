// web/src/features/store/StorePicker.jsx
import React from 'react';
import BaseModal, { ModalHeader } from '../../components/common/BaseModal';
import { useStoreSelection } from '../../context/StoreSelectionContext';
import './StorePicker.css';

/**
 * Gating modal shown to multi-store visitors who have not yet chosen a location.
 * Not dismissible — the storefront is locked until a store is selected.
 * Renders nothing for single-store tenants or when a store is already active.
 */
function StorePicker() {
  const { stores, activeStoreId, isMultiStore, selectStore } = useStoreSelection();

  // Invisible for single-store tenants or once a selection exists
  if (!isMultiStore || activeStoreId != null) return null;

  return (
    <BaseModal
      isOpen={true}
      onClose={() => {}}
      aria-labelledby="store-picker-title"
      maxWidth="480px"
      overlayClassName="store-picker-overlay"
    >
      <ModalHeader>
        <h2 className="modal-title" id="store-picker-title">Choose your location</h2>
      </ModalHeader>

      <div className="store-picker-body">
        <p className="store-picker-subtitle">
          Select a store to browse products and place orders.
        </p>

        <ul className="store-picker-list" role="list">
          {stores.map((store) => (
            <li key={store.id} className="store-picker-item">
              <button
                className="store-picker-card"
                onClick={() => selectStore(store.id)}
                type="button"
              >
                <span className="store-picker-name">{store.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </BaseModal>
  );
}

export default StorePicker;
