import React from 'react';
import { DollarSign } from 'lucide-react';
import PaymentSelector from './checkout/PaymentSelector';
import PaymentDetails from './checkout/PaymentDetails';
import ErrorMessage from './checkout/ErrorMessage';

export default function CheckoutPayment({
  showPaymentSelector,
  paymentSettings,
  creditBalance,
  isPickup,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  setErrors,
  errors,
  cashAppUsername,
  onCashAppChange,
  total
}) {
  return (
    <div className="checkout-section surface-card">
      <div className="section-header">
        <DollarSign size={20} />
        <h3>Payment Information</h3>
      </div>
      <div className="payment-info-box">
        {showPaymentSelector && (
          <PaymentSelector
            ctx={{ paymentSettings, creditBalance, isPickup }}
            selected={selectedPaymentMethod}
            onChange={(method) => {
              setSelectedPaymentMethod(method);
              setErrors((prev) => ({ ...prev, credit: '', cashAppUsername: '' }));
            }}
            errors={errors}
          />
        )}
        <PaymentDetails
          paymentMethod={selectedPaymentMethod}
          paymentSettings={paymentSettings}
          cashAppUsername={cashAppUsername}
          onCashAppChange={onCashAppChange}
          creditBalance={creditBalance}
          total={total}
          errors={errors}
        />
        <ErrorMessage message={errors.payment} />
      </div>
    </div>
  );
}
