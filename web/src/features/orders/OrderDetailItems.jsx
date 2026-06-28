import React from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { formatPrice } from '../../utils/currencyUtils';

export default function OrderDetailItems({
  order,
  isEditing,
  isAddingItem,
  products,
  newItemVariantId,
  setNewItemVariantId,
  newItemQuantity,
  setNewItemQuantity,
  onAddItem,
  onCancelAddItem,
  onStartAddItem,
  onVoidItem,
  onDeleteItem
}) {
  return (
    <div className="order-detail-items">
      <h4 className="order-detail-block-title">Items</h4>
      <div className="order-items-list">
        {order.items?.map((item, idx) => {
          const itemId = item.id ?? idx;
          return (
            <div
              key={itemId}
              className={`order-item ${item.voided ? 'order-item-voided' : ''} ${item.addedAfterSubmission ? 'order-item-added' : ''}`}
            >
              <div className="order-item-info">
                <span className="order-item-name">
                  {item.productName ?? 'Unknown Product'}
                  {item.variantLabel && item.variantLabel !== 'Default' && (
                    <span className="order-item-variant"> — {item.variantLabel}</span>
                  )}
                  {item.voided && <span className="order-item-badge badge-voided">Voided</span>}
                  {item.addedAfterSubmission && <span className="order-item-badge badge-added">Added</span>}
                </span>
                <span className="order-item-quantity">× {item.quantity}</span>
              </div>
              <div className="order-item-right">
                <span className="order-item-price">
                  {formatPrice(Number(item.unitPrice ?? item.price ?? 0) * item.quantity)}
                </span>
                {isEditing && !item.voided && (
                  <div className="order-item-actions">
                    <button
                      type="button"
                      onClick={() => onVoidItem(order.id, itemId, item.productName ?? 'item')}
                      className="btn-item-action btn-item-void"
                      title="Void"
                    >
                      <Minus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(order.id, itemId, item.productName ?? 'item')}
                      className="btn-item-action btn-item-delete"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isEditing && (
        <div className="add-item-section">
          {isAddingItem ? (
            <div className="add-item-form">
              <div className="add-item-field">
                <label>Product</label>
                <select
                  value={newItemVariantId}
                  onChange={(e) => setNewItemVariantId(e.target.value)}
                >
                  <option value="">Select a product</option>
                  {products.flatMap((p) =>
                    (p.variants ?? []).filter(v => v.active).map(v => (
                      <option key={v.id} value={v.id}>
                        {p.name}{v.label !== 'Default' ? ` — ${v.label}` : ''} — {formatPrice(Number(v.basePrice))}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="add-item-field add-item-field-qty">
                <label>Qty</label>
                <input
                  type="number"
                  min="1"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <button
                type="button"
                onClick={() => onAddItem(order.id)}
                className="btn-add-item"
                disabled={!newItemVariantId}
              >
                <Plus size={16} />
                Add
              </button>
              <button type="button" onClick={onCancelAddItem} className="btn-cancel-status">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => onStartAddItem(order.id)} className="btn-toggle-add-item">
              <Plus size={16} />
              Add Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
