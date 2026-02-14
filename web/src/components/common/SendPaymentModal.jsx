import React, { useState } from 'react';
import { DollarSign, CheckCircle } from 'lucide-react';
import './SendPaymentModal.css';

function SendPaymentModal({ isOpen, onDone, amount, cashAppUsername }) {
  const [paymentSent, setPaymentSent] = useState(false);

  if (!isOpen) return null;

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
          <div className="send-payment-modal-icon-wrapper">
            <DollarSign size={48} className="send-payment-modal-icon" />
          </div>
          <h2 className="send-payment-modal-title">Send Your Payment</h2>
          <p className="send-payment-modal-message">
            Please send <strong>${amount}</strong> via CashApp to complete your order.
          </p>
          {cashAppUsername && (
            <p className="send-payment-modal-hint">
              Payment will be received from <strong>{cashAppUsername}</strong>
            </p>
          )}
          <label className="send-payment-checkbox-label">
            <input
              type="checkbox"
              checked={paymentSent}
              onChange={(e) => setPaymentSent(e.target.checked)}
              className="send-payment-checkbox"
              aria-describedby="send-payment-checkbox-desc"
            />
            <span id="send-payment-checkbox-desc">I have sent the payment</span>
          </label>
        </div>
        <div className="send-payment-modal-actions">
          <button
            className="btn-send-payment-done"
            onClick={handleDone}
            disabled={!paymentSent}
            aria-disabled={!paymentSent}
          >
            <CheckCircle size={18} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default SendPaymentModal;
