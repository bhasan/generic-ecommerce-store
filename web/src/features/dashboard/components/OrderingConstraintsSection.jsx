import React, { useState, useEffect } from 'react';
import { ShoppingCart, Save } from 'lucide-react';
import './OrderingConstraintsSection.css';

const DEFAULT_CONSTRAINTS = {
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: false,
  deliveryDisabled: false,
  deliveryDisabledMessage: '',
};

function OrderingConstraintsSection({ isLoading, orderingConstraints, onSave }) {
  const [draft, setDraft] = useState(DEFAULT_CONSTRAINTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (orderingConstraints) {
      setDraft(orderingConstraints);
    }
  }, [orderingConstraints]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-content-section surface-card">
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading ordering constraints...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <ShoppingCart size={24} />
          Ordering Constraints
        </h3>
      </div>

      <p className="ordering-constraints-description">
        Configure rules that apply when customers place orders.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="ordering-constraints-fields">
          <div className="ordering-constraint-row">
            <div className="ordering-constraint-row-header">
              <div>
                <span className="form-label">Minimum Delivery Order</span>
                <p className="form-hint">Require a minimum subtotal for delivery orders.</p>
              </div>
              <label className="payment-method-toggle">
                <span className={`payment-method-toggle-status${draft.minimumDeliveryOrderEnabled ? ' enabled' : ''}`}>
                  {draft.minimumDeliveryOrderEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <input
                  type="checkbox"
                  checked={draft.minimumDeliveryOrderEnabled}
                  onChange={() =>
                    setDraft((prev) => ({ ...prev, minimumDeliveryOrderEnabled: !prev.minimumDeliveryOrderEnabled }))
                  }
                  className="payment-method-toggle-checkbox"
                />
              </label>
            </div>

            {draft.minimumDeliveryOrderEnabled && (
              <div className="form-group ordering-constraint-amount-group">
                <label className="form-label" htmlFor="min-delivery-order">
                  Minimum Amount ($)
                </label>
                <input
                  id="min-delivery-order"
                  type="number"
                  className="form-input ordering-constraints-amount-input"
                  value={draft.minimumDeliveryOrder}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      minimumDeliveryOrder: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  min="0"
                  step="1"
                  placeholder="35"
                />
              </div>
            )}
          </div>

          <div className="ordering-constraint-row">
            <div className="ordering-constraint-row-header">
              <div>
                <span className="form-label">Disable Delivery</span>
                <p className="form-hint">Temporarily disable the delivery option for all customers.</p>
              </div>
              <label className="payment-method-toggle">
                <span className={`payment-method-toggle-status${draft.deliveryDisabled ? ' enabled' : ''}`}>
                  {draft.deliveryDisabled ? 'Disabled' : 'Enabled'}
                </span>
                <input
                  type="checkbox"
                  checked={draft.deliveryDisabled}
                  onChange={() =>
                    setDraft((prev) => ({ ...prev, deliveryDisabled: !prev.deliveryDisabled }))
                  }
                  className="payment-method-toggle-checkbox"
                />
              </label>
            </div>

            {draft.deliveryDisabled && (
              <div className="form-group ordering-constraint-amount-group">
                <label className="form-label" htmlFor="delivery-disabled-message">
                  Message to Customers
                </label>
                <textarea
                  id="delivery-disabled-message"
                  className="form-input"
                  value={draft.deliveryDisabledMessage}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, deliveryDisabledMessage: e.target.value.slice(0, 300) }))
                  }
                  rows={3}
                  placeholder="e.g. Delivery is temporarily unavailable. Please check back soon."
                />
                <p className="form-hint">{draft.deliveryDisabledMessage.length}/300 characters</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn-action btn-primary ordering-constraints-save-btn"
          disabled={isSaving}
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

export default OrderingConstraintsSection;
