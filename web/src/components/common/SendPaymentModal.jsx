import React, { useState } from 'react';
import { CheckCircle, PackageCheck, MapPin, X } from 'lucide-react';
import './SendPaymentModal.css';

function SendPaymentModal({ isOpen, onDone, onCancel, pendingOrderState, storeCashappUsername, paymentSettings }) {
  const [paymentSent, setPaymentSent] = useState(false);

  if (!isOpen || !pendingOrderState) return null;

  const { order, deliveryMethod, deliveryAddress, pickupLocation, total } = pendingOrderState;

  const handleDone = () => {
    if (paymentSent) {
      setPaymentSent(false);
      onDone();
    }
  };

  return (
    <div className="send-payment-modal-overlay">
      <div className="send-payment-modal-container">
        <div className="send-payment-modal-content">
          {onCancel && (
            <button className="send-payment-modal-close" onClick={onCancel} aria-label="Close">
              <X size={20} />
            </button>
          )}
          <div className="send-payment-modal-icon-wrapper">
            <PackageCheck size={56} className="send-payment-modal-icon" />
          </div>

          <h2 className="send-payment-modal-title">
            Order Placed Successfully!
          </h2>
          <p className="send-payment-subtitle">
            Your order has been created.
          </p>
          <div className="send-payment-order-id-badge">
            <span className="send-payment-order-id-label">Order ID</span>
            <span className="send-payment-order-id-value">#{order?.id}</span>
          </div>

          <div className="send-payment-instructions-block">
            <h3 className="send-payment-instructions-heading">Payment Instructions</h3>
            <p className="send-payment-modal-message">
              Please send <strong>${total?.toFixed(2)}</strong> to complete your order.
            </p>

            <div className="send-payment-memo-card">
              <p className="send-payment-memo-label">
                <strong>Memo:</strong> Include the following in the memo/note field:
              </p>
              <div className="send-payment-memo-value">#{order?.id}</div>
            </div>

            {/* CashApp */}
            {(paymentSettings?.cashapp?.enabled ?? true) && (
              <div className="send-payment-method-card">
                <p className="send-payment-method-handle">
                  <strong>CashApp</strong> — Send to:{' '}
                  <strong className="send-payment-method-handle-value">
                    {paymentSettings?.cashapp?.handle || storeCashappUsername || 'Loading...'}
                  </strong>
                </p>
              </div>
            )}

            {/* Zelle */}
            {paymentSettings?.zelle?.enabled && (
              <div className="send-payment-method-card">
                <p className="send-payment-method-handle">
                  <strong>Zelle</strong> — Send to:{' '}
                  <strong className="send-payment-method-handle-value">
                    {paymentSettings.zelle.handle}
                  </strong>
                </p>
              </div>
            )}

            {/* Venmo */}
            {paymentSettings?.venmo?.enabled && (
              <div className="send-payment-method-card">
                <p className="send-payment-method-handle">
                  <strong>Venmo</strong> — Send to:{' '}
                  <strong className="send-payment-method-handle-value">
                    {paymentSettings.venmo.handle}
                  </strong>
                </p>
              </div>
            )}
          </div>

          <div className="send-payment-location-block">
            <div className="send-payment-location-header">
              <MapPin size={18} className="send-payment-location-icon" />
              <h3 className="send-payment-location-title">
                {deliveryMethod === 'DELIVERY' ? 'Delivery Address' : 'Store Pickup Location'}
              </h3>
            </div>
            <p className="send-payment-location-address">
              {deliveryMethod === 'DELIVERY' ? deliveryAddress : pickupLocation}
            </p>
          </div>

          <label className="send-payment-checkbox-label">
            <input
              type="checkbox"
              checked={paymentSent}
              onChange={(e) => setPaymentSent(e.target.checked)}
              className="send-payment-checkbox"
            />
            <span>
              {(paymentSettings?.cashapp?.enabled && !paymentSettings?.zelle?.enabled && !paymentSettings?.venmo?.enabled)
                ? <>I have sent the payment on CashApp and included Order <strong>#{order?.id}</strong> in the memo.</>
                : <>I have sent the payment using one of the methods above and included Order <strong>#{order?.id}</strong> as reference.</>
              }
            </span>
          </label>
        </div>

        <div className="send-payment-modal-actions">
          <button
            className="btn-send-payment-done"
            onClick={handleDone}
            disabled={!paymentSent}
          >
            <CheckCircle size={20} />
            Complete Order
          </button>
          {onCancel && (
            <button className="btn-send-payment-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SendPaymentModal;
