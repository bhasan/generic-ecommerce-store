import React from 'react';
import { formatPrice } from '../../utils/currencyUtils';

export default function CheckoutSummary({
  cart,
  subtotal,
  taxRate,
  tax,
  total,
  handlePlaceOrder,
  isSubmitting,
  deliverySubmitBlocked,
  deliveryEligibility,
  isCCPayment,
  isStoreCreditPayment,
  isInStorePayment
}) {
  return (
    <div className="checkout-summary surface-card-accent">
      <h3 className="summary-title">Order Summary</h3>

      <div className="summary-details">
        <div className="summary-row">
          <span>Subtotal ({cart.length} {cart.length === 1 ? 'item' : 'items'})</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>Tax ({(taxRate * 100).toFixed(2).replace(/\.00$/, '')}%)</span>
          <span>{formatPrice(tax)}</span>
        </div>
        <div className="summary-divider"></div>
        <div className="summary-row summary-total">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      <button
        onClick={handlePlaceOrder}
        disabled={isSubmitting || deliverySubmitBlocked}
        className="btn-place-order"
      >
        {isSubmitting
          ? 'Processing...'
          : deliveryEligibility.status === 'checking'
            ? 'Checking delivery...'
            : isCCPayment
              ? 'Place Order & Pay →'
              : 'Place Order'}
      </button>

      <p className="checkout-note">{
        isStoreCreditPayment ? 'Store credit will be deducted from your balance when you place this order.'
          : isInStorePayment ? 'Have your payment ready when you arrive to pick up your order.'
            : 'By placing this order, you agree to send payment via the method(s) shown above'
      }</p>
    </div>
  );
}
