import React, { useState, useEffect, useCallback } from 'react';
import { Boxes } from 'lucide-react';
import LoadingState from '../../../components/common/LoadingState';
import EmptyState from '../../../components/common/EmptyState';
import { getManagedStores } from '../../../services/storesApi';
import { getStoreOverrides, upsertStoreOverride, deleteStoreOverride } from '../../../services/storeOverridesApi';
import './StoreInventoryPage.css';

// Inherit state: activeOverride not set — the variant inherits base active status
const ACTIVE_INHERIT = '';
const ACTIVE_TRUE = 'true';
const ACTIVE_FALSE = 'false';

function toActiveOverride(val) {
  if (val === ACTIVE_TRUE) return true;
  if (val === ACTIVE_FALSE) return false;
  return null; // inherit
}

function fromActiveOverride(val) {
  if (val === true) return ACTIVE_TRUE;
  if (val === false) return ACTIVE_FALSE;
  return ACTIVE_INHERIT;
}

function formatMoney(num) {
  if (num == null) return '';
  return Number(num).toFixed(2);
}

/** Build a map of variantId → override row for fast lookup */
function buildOverrideMap(overrides) {
  const map = {};
  (overrides || []).forEach((o) => { map[o.variantId] = o; });
  return map;
}

/** Build per-row edit state from current override (if any) */
function rowStateFromOverride(override) {
  if (!override) {
    return { stock: '', priceOverride: '', activeOverride: ACTIVE_INHERIT };
  }
  return {
    stock: override.stock != null ? String(override.stock) : '',
    priceOverride: override.priceOverride != null ? formatMoney(override.priceOverride) : '',
    activeOverride: fromActiveOverride(override.activeOverride),
  };
}

function StoreInventoryPage() {
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState(null);

  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);

  const [overrideData, setOverrideData] = useState(null); // { storeId, overrides, variants }
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  // Per-row edit state: { [variantId]: { stock, priceOverride, activeOverride } }
  const [rowEdits, setRowEdits] = useState({});
  // Per-row saving / error state
  const [rowSaving, setRowSaving] = useState({});
  const [rowError, setRowError] = useState({});

  // --- Load stores on mount ---
  useEffect(() => {
    let cancelled = false;
    setStoresLoading(true);
    getManagedStores()
      .then((data) => { if (!cancelled) setStores(data || []); })
      .catch((err) => { if (!cancelled) setStoresError(err.message || 'Failed to load stores'); })
      .finally(() => { if (!cancelled) setStoresLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // --- Load overrides when a non-default store is selected ---
  const loadOverrides = useCallback((storeId) => {
    setDataLoading(true);
    setDataError(null);
    getStoreOverrides(storeId)
      .then((data) => {
        setOverrideData(data);
        // Initialise row edit state from fetched overrides
        const overrideMap = buildOverrideMap(data?.overrides);
        const edits = {};
        (data?.variants || []).forEach((v) => {
          edits[v.id] = rowStateFromOverride(overrideMap[v.id]);
        });
        setRowEdits(edits);
        setRowError({});
      })
      .catch((err) => { setDataError(err.message || 'Failed to load inventory'); })
      .finally(() => setDataLoading(false));
  }, []);

  const handleStoreChange = (e) => {
    const id = e.target.value;
    setSelectedStoreId(id);
    setOverrideData(null);
    setRowEdits({});
    setRowError({});
    setDataError(null);
    if (!id) { setSelectedStore(null); return; }
    const store = stores.find((s) => String(s.id) === id);
    setSelectedStore(store || null);
    if (store && !store.isDefault) {
      loadOverrides(id);
    }
  };

  const handleFieldChange = (variantId, field, value) => {
    setRowEdits((prev) => ({
      ...prev,
      [variantId]: { ...prev[variantId], [field]: value },
    }));
    // Clear per-row error when user edits
    setRowError((prev) => ({ ...prev, [variantId]: null }));
  };

  const handleSaveRow = async (variantId) => {
    const edit = rowEdits[variantId] || {};
    setRowSaving((prev) => ({ ...prev, [variantId]: true }));
    setRowError((prev) => ({ ...prev, [variantId]: null }));
    try {
      const body = {
        storeId: Number(selectedStoreId),
        variantId,
      };
      if (edit.stock !== '') body.stock = Number(edit.stock);
      if (edit.priceOverride !== '') body.priceOverride = parseFloat(edit.priceOverride);
      const ao = toActiveOverride(edit.activeOverride);
      if (ao !== null) body.activeOverride = ao;

      await upsertStoreOverride(body);
      // Refresh after save
      loadOverrides(selectedStoreId);
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [variantId]: err.message || 'Failed to save override',
      }));
    } finally {
      setRowSaving((prev) => ({ ...prev, [variantId]: false }));
    }
  };

  const handleClearRow = async (variantId) => {
    setRowSaving((prev) => ({ ...prev, [variantId]: true }));
    setRowError((prev) => ({ ...prev, [variantId]: null }));
    try {
      await deleteStoreOverride(Number(selectedStoreId), variantId);
      loadOverrides(selectedStoreId);
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [variantId]: err.message || 'Failed to clear override',
      }));
    } finally {
      setRowSaving((prev) => ({ ...prev, [variantId]: false }));
    }
  };

  // --- Derived: overrideMap for fast lookup during render ---
  const overrideMap = buildOverrideMap(overrideData?.overrides);

  // --- Render ---
  return (
    <div className="manage-store-section store-inventory-page">
      <div className="manage-store-section-header">
        <h1 className="manage-store-section-title">Store Inventory</h1>
        <p className="manage-store-section-subtitle">
          Edit per-store stock, price, and availability overrides for each variant.
        </p>
      </div>

      {/* Store selector */}
      {storesLoading ? (
        <LoadingState message="Loading stores..." />
      ) : storesError ? (
        <div className="store-inventory-error" role="alert">{storesError}</div>
      ) : (
        <div className="store-inventory-selector">
          <label htmlFor="store-inventory-store-select">Select store</label>
          <select
            id="store-inventory-store-select"
            className="store-inventory-select"
            value={selectedStoreId}
            onChange={handleStoreChange}
          >
            <option value="">— Select a store —</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}{s.isDefault ? ' (Default)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Default store notice */}
      {selectedStore?.isDefault && (
        <div className="store-inventory-notice" role="note">
          <Boxes size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Default store</strong> — the default store uses the base catalog values directly.
            Per-store overrides apply to non-default stores only. Select a non-default store to edit its overrides.
          </span>
        </div>
      )}

      {/* Inventory table for non-default stores */}
      {selectedStore && !selectedStore.isDefault && (
        <>
          {dataLoading && <LoadingState message="Loading inventory..." />}

          {dataError && !dataLoading && (
            <div className="store-inventory-error" role="alert">{dataError}</div>
          )}

          {!dataLoading && !dataError && overrideData && (
            overrideData.variants?.length === 0 ? (
              <EmptyState
                icon={<Boxes size={48} />}
                message="No variants found for this tenant. Add products first."
              />
            ) : (
              <div className="store-inventory-table-wrapper">
                <table className="store-inventory-table" aria-label="Store inventory overrides">
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>Base price</th>
                      <th>Base stock</th>
                      <th>Base active</th>
                      <th>Override price</th>
                      <th>Override stock</th>
                      <th>Override active</th>
                      <th>Effective</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overrideData.variants || []).map((v) => {
                      const override = overrideMap[v.id];
                      const edit = rowEdits[v.id] || { stock: '', priceOverride: '', activeOverride: ACTIVE_INHERIT };
                      const isSaving = !!rowSaving[v.id];
                      const rowErr = rowError[v.id];
                      const hasOverride = !!override;

                      // Effective values
                      const effectivePrice = override?.priceOverride != null
                        ? override.priceOverride
                        : v.basePrice;
                      const effectiveStock = override?.stock != null
                        ? override.stock
                        : v.stock;
                      const effectiveActive = override?.activeOverride != null
                        ? override.activeOverride
                        : v.active;

                      return (
                        <React.Fragment key={v.id}>
                          <tr>
                            <td>
                              <div className="variant-product-name">{v.productName}</div>
                              <div className="variant-label">{v.label}</div>
                            </td>
                            <td>${formatMoney(v.basePrice)}</td>
                            <td>{v.stock ?? '—'}</td>
                            <td>{v.active ? 'Yes' : 'No'}</td>

                            {/* Override price */}
                            <td>
                              <input
                                type="number"
                                className="override-input"
                                aria-label={`Override price for ${v.productName} ${v.label}`}
                                value={edit.priceOverride}
                                min="0"
                                step="0.01"
                                onChange={(e) => handleFieldChange(v.id, 'priceOverride', e.target.value)}
                                disabled={isSaving}
                                placeholder="inherit"
                              />
                            </td>

                            {/* Override stock */}
                            <td>
                              <input
                                type="number"
                                className="override-input"
                                aria-label={`Override stock for ${v.productName} ${v.label}`}
                                value={edit.stock}
                                min="0"
                                step="1"
                                onChange={(e) => handleFieldChange(v.id, 'stock', e.target.value)}
                                disabled={isSaving}
                                placeholder="inherit"
                              />
                            </td>

                            {/* Override active */}
                            <td>
                              <select
                                className="override-select"
                                aria-label={`Override active for ${v.productName} ${v.label}`}
                                value={edit.activeOverride}
                                onChange={(e) => handleFieldChange(v.id, 'activeOverride', e.target.value)}
                                disabled={isSaving}
                              >
                                <option value={ACTIVE_INHERIT}>Inherit</option>
                                <option value={ACTIVE_TRUE}>Yes</option>
                                <option value={ACTIVE_FALSE}>No</option>
                              </select>
                            </td>

                            {/* Effective */}
                            <td>
                              <div>${formatMoney(effectivePrice)}</div>
                              <div className="effective-value">
                                Stock: {effectiveStock ?? '—'} / Active: {effectiveActive ? 'Yes' : 'No'}
                              </div>
                              {hasOverride && <span className="override-badge">overridden</span>}
                            </td>

                            {/* Actions */}
                            <td>
                              <div className="row-actions">
                                <button
                                  className="btn-save-row"
                                  onClick={() => handleSaveRow(v.id)}
                                  disabled={isSaving}
                                  aria-label={`Save override for ${v.productName} ${v.label}`}
                                >
                                  {isSaving ? 'Saving…' : 'Save'}
                                </button>
                                {hasOverride && (
                                  <button
                                    className="btn-clear-row"
                                    onClick={() => handleClearRow(v.id)}
                                    disabled={isSaving}
                                    aria-label={`Clear override for ${v.productName} ${v.label}`}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {rowErr && (
                            <tr>
                              <td colSpan={9}>
                                <div className="store-inventory-error" role="alert">{rowErr}</div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

export default StoreInventoryPage;
