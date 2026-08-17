import React from 'react';
import { Lock } from 'lucide-react';
import { PaymentMethod } from '../../../constants/orderMethods';
import ErrorMessage from './ErrorMessage';
import { formatPrice } from '../../../utils/currencyUtils';

export default function PaymentDetails({
  paymentMethod,
  paymentSettings,
  cashAppUsername,
  onCashAppChange,
  creditBalance,
  total,
  errors,
}) {
  if (paymentMethod === PaymentMethod.EXTERNAL) {
    return (
      <div className="payment-method-detail">
        {paymentSettings?.cashapp?.enabled && (
          <div className="form-group">
            <label htmlFor="cashapp">Payment will be received from (your payment username):</label>
            <input
              id="cashapp"
              type="text"
              value={cashAppUsername}
              onChange={(e) => {
                let value = e.target.value;
                if (value && !value.startsWith('$')) value = '$' + value;
                onCashAppChange(value);
              }}
              placeholder="$username"
              className={`form-input ${errors.cashAppUsername ? 'form-error' : ''}`}
            />
            <ErrorMessage message={errors.cashAppUsername} />
          </div>
        )}
        {paymentSettings?.cashapp?.enabled && (
          <div className="payment-method-info">
            <p className="payment-instructions">
              <strong>CashApp:</strong> Send payment to <strong>{paymentSettings.cashapp.handle}</strong>
            </p>
          </div>
        )}
        {paymentSettings?.zelle?.enabled && (
          <div className="payment-method-info">
            <p className="payment-instructions">
              <strong>Zelle:</strong> Send payment to <strong>{paymentSettings.zelle.handle}</strong>
            </p>
          </div>
        )}
        {paymentSettings?.venmo?.enabled && (
          <div className="payment-method-info">
            <p className="payment-instructions">
              <strong>Venmo:</strong> Send payment to <strong>{paymentSettings.venmo.handle}</strong>
            </p>
          </div>
        )}
        <p className="payment-memo-hint">
          After &ldquo;Place Order&rdquo; is clicked, you will get an order number. Put that in the memo.
        </p>
      </div>
    );
  }

  if (paymentMethod === PaymentMethod.STORE_CREDIT) {
    return (
      <div className="payment-method-detail payment-credit-confirm">
        <p>Your store credit balance of <strong>{formatPrice(creditBalance)}</strong> will be used to pay for this order.</p>
      </div>
    );
  }

  if (paymentMethod === PaymentMethod.IN_STORE) {
    return (
      <div className="payment-method-detail payment-credit-confirm">
        <p>You&rsquo;ll pay <strong>{formatPrice(total)}</strong> when you arrive to pick up your order.</p>
      </div>
    );
  }

  if (paymentMethod === PaymentMethod.CC) {
    return (
      <div className="payment-method-detail payment-cc-info">
        <p>You&rsquo;ll be taken to a secure payment form. Your order is placed first, then confirmed automatically once payment is complete.</p>
        <p><Lock size={14} /> Secured by Authorize.Net &mdash; card data never touches our servers</p>
      </div>
    );
  }

  return null;
}
