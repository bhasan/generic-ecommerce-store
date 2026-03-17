import React, { useState } from 'react';
import { CheckCircle, PackageCheck, MapPin } from 'lucide-react';
import './SendPaymentModal.css';

function SendPaymentModal({ isOpen, onDone, pendingOrderState, storeCashappUsername }) {
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
        <div className="send-payment-modal-content" style={{ textAlign: 'left' }}>
          <div className="send-payment-modal-icon-wrapper" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
            <PackageCheck size={56} className="send-payment-modal-icon" style={{ color: 'var(--color-primary)' }} />
          </div>
          
          <h2 className="send-payment-modal-title" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            Order Placed Successfully!
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Your order has been created.
          </p>
          <div className="send-payment-order-id-badge">
            <span className="send-payment-order-id-label">Order ID</span>
            <span className="send-payment-order-id-value">#{order?.id}</span>
          </div>

          <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Payment Instructions</h3>
            <p className="send-payment-modal-message" style={{ margin: '0 0 1rem 0' }}>
              Please send <strong>${total?.toFixed(2)}</strong> via CashApp to complete your order.
            </p>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-secondary)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0, color: 'var(--text-primary)' }}>
                Send to: <strong style={{ color: 'var(--color-secondary)', fontSize: '1.1rem' }}>{storeCashappUsername || 'Loading...'}</strong>
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                <strong style={{ color: '#ef4444' }}>CRITICAL:</strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>Include your order ID <strong style={{ color: 'var(--text-primary)' }}>"{order?.id && `#${order.id}`}"</strong> in CashApp memo.</span>
              </p>
            </div>
          </div>

          <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <MapPin size={18} style={{ color: 'var(--color-primary-light)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                {deliveryMethod === 'DELIVERY' ? 'Delivery Address' : 'Store Pickup Location'}
              </h3>
            </div>
            <p style={{ margin: '0 0 0 1.5rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
              {deliveryMethod === 'DELIVERY' ? deliveryAddress : pickupLocation}
            </p>
          </div>

          <label className="send-payment-checkbox-label" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'var(--surface)', padding: '1rem', borderRadius: '0.5rem', cursor: 'pointer', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              checked={paymentSent}
              onChange={(e) => setPaymentSent(e.target.checked)}
              className="send-payment-checkbox"
              style={{ marginTop: '0.25rem', width: '1.25rem', height: '1.25rem' }}
            />
            <span style={{ color: 'var(--text-primary)', lineHeight: '1.5' }}>
              I have sent the payment on CashApp and included Order <strong>#{order?.id}</strong> in the memo.
            </span>
          </label>
        </div>
        
        <div className="send-payment-modal-actions" style={{ marginTop: '2rem' }}>
          <button
            className="btn-send-payment-done"
            onClick={handleDone}
            disabled={!paymentSent}
            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
          >
            <CheckCircle size={20} />
            Complete Order
          </button>
        </div>
      </div>
    </div>
  );
}

export default SendPaymentModal;
