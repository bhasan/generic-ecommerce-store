import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './CheckoutPage.css';
import { useApp } from '../../context/AppContext';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';
import { ArrowLeft, Package, MapPin, FileText, DollarSign, AlertCircle } from 'lucide-react';
import SendPaymentModal from '../../components/common/SendPaymentModal';
import { getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';
import HeaderDivider from '../../components/common/HeaderDivider';
import {
  formatDeliveryAddress,
  isDeliveryAddressComplete,
  normalizeDeliveryAddress,
  parseAddress,
} from '../../utils/address';

// Creates the empty delivery-check state used before validation starts or after it is reset.
const createInitialEligibilityState = () => ({
  status: 'idle',
  result: null,
  error: '',
});

// Drives checkout UI for pickup and delivery, including delivery prechecks and external-payment recovery.
function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    cart,
    currentUser,
    checkout,
    checkDeliveryEligibility,
    deleteOrder,
    restoreCart,
    taxRate,
    minimumDeliveryOrder,
    minimumDeliveryOrderEnabled,
    deliveryDisabled,
    deliveryDisabledMessage,
    deliveryRadiusMiles,
    pickupLocation,
    storeCashappUsername,
    paymentSettings,
    creditBalance,
  } = useApp();
  const [deliveryMethod, setDeliveryMethod] = useState(location.state?.deliveryMethod || DeliveryMethod.PICKUP);
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: 'TX',
    zipCode: '',
    apartment: ''
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cashAppUsername, setCashAppUsername] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(PaymentMethod.EXTERNAL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSendPaymentModal, setShowSendPaymentModal] = useState(false);
  const [pendingOrderState, setPendingOrderState] = useState(null);
  const [orderCancelled, setOrderCancelled] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [errors, setErrors] = useState({});
  const [deliveryEligibility, setDeliveryEligibility] = useState(createInitialEligibilityState);
  const latestEligibilityRequestRef = useRef(0);
  const prefilledAddressKeyRef = useRef('');
  const hasUsedImmediatePrefillCheckRef = useRef(false);

  const isPickup = deliveryMethod === DeliveryMethod.PICKUP;
  const isDelivery = deliveryMethod === DeliveryMethod.DELIVERY;
  const isCreditPayment = selectedPaymentMethod === PaymentMethod.CREDIT;
  const isInStorePayment = selectedPaymentMethod === PaymentMethod.IN_STORE;
  const isExternalPayment = selectedPaymentMethod === PaymentMethod.EXTERNAL;
  const showPaymentSelector = creditBalance > 0 || isPickup;

  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.address) {
      const parsedAddress = parseAddress(currentUser.address);
      setAddress(parsedAddress);
      prefilledAddressKeyRef.current = JSON.stringify(normalizeDeliveryAddress(parsedAddress));
      hasUsedImmediatePrefillCheckRef.current = false;
    } else {
      prefilledAddressKeyRef.current = '';
      hasUsedImmediatePrefillCheckRef.current = false;
    }

    if (currentUser.cashapp) {
      setCashAppUsername(currentUser.cashapp);
    }
  }, [currentUser]);

  const subtotal = cart.reduce((sum, item) => {
    const unitPrice = getDiscountedUnitPrice(item, item.quantity);
    return sum + (unitPrice * item.quantity);
  }, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const normalizedAddress = normalizeDeliveryAddress(address);
  const normalizedAddressKey = JSON.stringify(normalizedAddress);
  const deliveryAddressComplete = isDeliveryAddressComplete(normalizedAddress);
  const deliveryMinimumBlocked = minimumDeliveryOrderEnabled && subtotal < minimumDeliveryOrder;
  const deliveryBlocked = deliveryDisabled || deliveryMinimumBlocked;
  const deliveryBlockedReason = deliveryDisabled
    ? (deliveryDisabledMessage || 'Delivery is currently unavailable.')
    : `Delivery requires a $${minimumDeliveryOrder.toFixed(2)} minimum ($${(minimumDeliveryOrder - subtotal).toFixed(2)} more needed)`;
  const deliverySubmitBlocked = isDelivery && (
    deliveryBlocked
    || !deliveryAddressComplete
    || deliveryEligibility.status === 'checking'
    || !deliveryEligibility.result?.deliverable
  );

  useEffect(() => {
    if (!isDelivery) {
      latestEligibilityRequestRef.current += 1;
      setDeliveryEligibility(createInitialEligibilityState());
      return;
    }

    if (!deliveryAddressComplete) {
      latestEligibilityRequestRef.current += 1;
      setDeliveryEligibility(createInitialEligibilityState());
      return;
    }

    const requestId = latestEligibilityRequestRef.current + 1;
    latestEligibilityRequestRef.current = requestId;
    const shouldRunImmediately = (
      normalizedAddressKey === prefilledAddressKeyRef.current
      && !hasUsedImmediatePrefillCheckRef.current
    );

    const timeoutId = setTimeout(async () => {
      setDeliveryEligibility((prev) => ({
        ...prev,
        status: 'checking',
        error: '',
      }));

      try {
        const result = await checkDeliveryEligibility(normalizedAddress);
        if (latestEligibilityRequestRef.current !== requestId) {
          return;
        }

        if (shouldRunImmediately) {
          hasUsedImmediatePrefillCheckRef.current = true;
        }

        setDeliveryEligibility({
          status: 'ready',
          result,
          error: '',
        });
      } catch (error) {
        if (latestEligibilityRequestRef.current !== requestId) {
          return;
        }

        setDeliveryEligibility({
          status: 'error',
          result: null,
          error: error.message || 'Delivery verification failed. Please try again.',
        });
      }
    }, shouldRunImmediately ? 0 : 500);

    return () => clearTimeout(timeoutId);
  }, [
    checkDeliveryEligibility,
    deliveryAddressComplete,
    isDelivery,
    normalizedAddressKey,
  ]);

  useEffect(() => {
    if (deliveryBlocked && isDelivery) {
      setDeliveryMethod(DeliveryMethod.PICKUP);
    }
  }, [deliveryBlocked, isDelivery]);

  useEffect(() => {
    if (isDelivery && isInStorePayment) {
      setSelectedPaymentMethod(PaymentMethod.EXTERNAL);
    }
  }, [isDelivery, isInStorePayment]);

  useEffect(() => {
    if (cart.length === 0 && !isSubmitting && !pendingOrderState && !showSendPaymentModal && !orderCancelled && !orderCompleted) {
      navigate('/cart');
    }
  }, [cart.length, isSubmitting, pendingOrderState, showSendPaymentModal, orderCancelled, orderCompleted, navigate]);

  if (cart.length === 0 && !isSubmitting && !pendingOrderState && !showSendPaymentModal && !orderCancelled && !orderCompleted) {
    return null;
  }

  // Clears one address-field error and any derived delivery-eligibility error after user edits that field.
  const clearAddressError = (fieldName) => {
    setErrors((prev) => ({
      ...prev,
      [fieldName]: '',
      deliveryEligibility: '',
    }));
  };

  // Validates address, payment, delivery eligibility, and credit rules before any order request is submitted.
  const validateForm = () => {
    const newErrors = {};

    if (isDelivery) {
      if (!normalizedAddress.street) newErrors.street = 'Street address is required';
      if (!normalizedAddress.city) newErrors.city = 'City is required';
      if (!normalizedAddress.state) newErrors.state = 'State is required';
      if (!normalizedAddress.zipCode) {
        newErrors.zipCode = 'ZIP code is required';
      } else if (!/^\d{5}$/.test(normalizedAddress.zipCode)) {
        newErrors.zipCode = 'ZIP code must contain 5 digits';
      }

      if (deliveryMinimumBlocked) {
        newErrors.deliveryEligibility = `Delivery requires a $${minimumDeliveryOrder.toFixed(2)} minimum subtotal.`;
      } else if (!deliveryAddressComplete) {
        newErrors.deliveryEligibility = 'Complete the delivery address so we can verify eligibility.';
      } else if (deliveryEligibility.status === 'checking') {
        newErrors.deliveryEligibility = 'Delivery eligibility is still being checked.';
      } else if (deliveryEligibility.status === 'error') {
        newErrors.deliveryEligibility = deliveryEligibility.error;
      } else if (!deliveryEligibility.result?.deliverable) {
        newErrors.deliveryEligibility = deliveryEligibility.result?.message || 'Delivery is not available for this address.';
      }
    }

    if (isExternalPayment && paymentSettings?.cashapp?.enabled) {
      if (!cashAppUsername.trim()) {
        newErrors.cashAppUsername = 'CashApp username is required';
      } else if (!cashAppUsername.startsWith('$')) {
        newErrors.cashAppUsername = 'CashApp username must start with $';
      } else if (cashAppUsername.length < 2 || cashAppUsername.length > 21) {
        newErrors.cashAppUsername = 'CashApp username must be between 1-20 characters (excluding $)';
      }
    }

    if (isCreditPayment && creditBalance < total) {
      newErrors.credit = `Insufficient credit balance. You have $${creditBalance.toFixed(2)} but the order total is $${total.toFixed(2)}.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Places the order, preserves a restorable cart snapshot, and branches correctly for external-payment flows.
  const handlePlaceOrder = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const itemsForSuccess = [...cart];
      const newOrder = await checkout(
        cashAppUsername,
        deliveryMethod,
        selectedPaymentMethod,
        isDelivery ? normalizedAddress : undefined
      );

      const orderState = {
        order: newOrder,
        deliveryMethod,
        deliveryAddress: isDelivery
          ? (newOrder.deliveryAddress || formatDeliveryAddress(normalizedAddress))
          : 'Store Pickup',
        pickupLocation: isPickup ? pickupLocation : null,
        addressDetails: normalizedAddress,
        specialInstructions,
        cashAppUsername,
        subtotal,
        tax,
        total,
        items: itemsForSuccess,
        paymentMethod: selectedPaymentMethod
      };

      if (!isExternalPayment) {
        navigate('/order-success', { state: orderState });
      } else {
        setPendingOrderState(orderState);
        setShowSendPaymentModal(true);
      }
    } catch {
      // Error is already handled in AppContext.
    } finally {
      setIsSubmitting(false);
    }
  };

  // Finalizes the external-payment handoff after the user confirms they sent payment.
  const handleSendPaymentDone = () => {
    setOrderCompleted(true);
    setShowSendPaymentModal(false);
    if (pendingOrderState) {
      navigate('/order-success', { state: pendingOrderState });
      setPendingOrderState(null);
    }
  };

  // Cancels the pending external-payment order and restores the cart even if deleteOrder fails.
  const handleSendPaymentCancel = async () => {
    setOrderCancelled(true);
    try {
      if (pendingOrderState?.order?.id) {
        await deleteOrder(pendingOrderState.order.id, { silent: true });
      }
    } catch {
      // Cancellation should still close the modal and restore the cart even if cleanup fails.
    } finally {
      if (pendingOrderState?.items?.length) {
        restoreCart(pendingOrderState.items);
      }
      setShowSendPaymentModal(false);
      setPendingOrderState(null);
    }
  };

  // Chooses the most specific delivery status message so disabled-delivery reasons beat generic minimum-order text.
  const renderDeliveryEligibilityMessage = () => {
    if (!isDelivery) return null;

    if (deliveryMinimumBlocked) {
      return (
        <p className="delivery-blocked-hint">
          Delivery requires a ${minimumDeliveryOrder.toFixed(2)} minimum (${(minimumDeliveryOrder - subtotal).toFixed(2)} more needed)
        </p>
      );
    }

    if (!deliveryAddressComplete) {
      return (
        <p className="delivery-check-hint">
          Enter your full address to check whether it is within our {deliveryRadiusMiles.toFixed(2)} mile delivery area.
        </p>
      );
    }

    if (deliveryEligibility.status === 'checking') {
      return <p className="delivery-check-hint">Checking delivery eligibility for this address...</p>;
    }

    if (deliveryEligibility.status === 'error') {
      return (
        <div className="delivery-eligibility-banner delivery-eligibility-banner-warning">
          <AlertCircle size={16} />
          <span>{deliveryEligibility.error}</span>
        </div>
      );
    }

    if (!deliveryEligibility.result) {
      return null;
    }

    const toneClass = deliveryEligibility.result.deliverable
      ? (deliveryEligibility.result.deliveryZoneSource === 'ZIP_FALLBACK'
        ? 'delivery-eligibility-banner-fallback'
        : 'delivery-eligibility-banner-success')
      : (deliveryEligibility.result.deliveryZoneStatus === 'UNVERIFIED'
        ? 'delivery-eligibility-banner-warning'
        : 'delivery-eligibility-banner-error');

    return (
      <div className={`delivery-eligibility-banner ${toneClass}`}>
        <AlertCircle size={16} />
        <span>{deliveryEligibility.result.message}</span>
      </div>
    );
  };

  return (
    <div className="checkout-page-container">
      <button onClick={() => navigate('/cart')} className="btn-back">
        <ArrowLeft size={18} />
        Back to Cart
      </button>

      <div className="checkout-header section-header-surface">
        <h2 className="page-title">Checkout</h2>
        <div className="checkout-progress">
          <div className="progress-step progress-step-active">
            <div className="progress-circle">1</div>
            <span>Review & Payment</span>
          </div>
          <div className="progress-line"></div>
          <div className="progress-step">
            <div className="progress-circle">2</div>
            <span>Order Placed</span>
          </div>
        </div>
      </div>
      <HeaderDivider />

      <SendPaymentModal
        isOpen={showSendPaymentModal}
        onDone={handleSendPaymentDone}
        onCancel={handleSendPaymentCancel}
        pendingOrderState={pendingOrderState}
        storeCashappUsername={storeCashappUsername}
        paymentSettings={paymentSettings}
      />

      <div className="checkout-content">
        <div className="checkout-main">
          <div className="checkout-section surface-card">
            <div className="section-header">
              <Package size={20} />
              <h3>Order Review</h3>
            </div>
            <div className="order-items-review">
              {cart.map((item) => {
                const imageSrc = getProductImageSrc(item);
                const unitPrice = getDiscountedUnitPrice(item, item.quantity);
                return (
                  <div key={item.id} className="checkout-item">
                    <ProductImage src={imageSrc} alt={item.name} className="checkout-item-image" />
                    <div className="checkout-item-details">
                      <h4>{item.name}</h4>
                      <p className="checkout-item-category">{getProductCategoryLabel(item)}</p>
                      <p className="checkout-item-price">${unitPrice.toFixed(2)} x {item.quantity}</p>
                    </div>
                    <div className="checkout-item-total">${(unitPrice * item.quantity).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="checkout-section surface-card">
            <div className="section-header">
              <DollarSign size={20} />
              <h3>Payment Information</h3>
            </div>
            <div className="payment-info-box">
              {showPaymentSelector && (
                <div className="form-group">
                  <label className="payment-method-select-label">Payment Method</label>
                  <div className="payment-method-options">
                    {creditBalance > 0 && (
                      <label className={`payment-method-option ${isCreditPayment ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={PaymentMethod.CREDIT}
                          checked={isCreditPayment}
                          onChange={() => {
                            setSelectedPaymentMethod(PaymentMethod.CREDIT);
                            setErrors({ ...errors, credit: '', cashAppUsername: '' });
                          }}
                        />
                        <span>Store Credit (${creditBalance.toFixed(2)} available)</span>
                      </label>
                    )}
                    <label className={`payment-method-option ${isExternalPayment ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={PaymentMethod.EXTERNAL}
                        checked={isExternalPayment}
                        onChange={() => {
                          setSelectedPaymentMethod(PaymentMethod.EXTERNAL);
                          setErrors({ ...errors, credit: '' });
                        }}
                      />
                      <span>Pay via CashApp / Zelle / Venmo</span>
                    </label>
                    {isPickup && (
                      <label className={`payment-method-option ${isInStorePayment ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={PaymentMethod.IN_STORE}
                          checked={isInStorePayment}
                          onChange={() => {
                            setSelectedPaymentMethod(PaymentMethod.IN_STORE);
                            setErrors({ ...errors, credit: '', cashAppUsername: '' });
                          }}
                        />
                        <span>Pay in Store</span>
                      </label>
                    )}
                  </div>
                  {errors.credit && (
                    <span className="error-message">
                      <AlertCircle size={14} />
                      {errors.credit}
                    </span>
                  )}
                </div>
              )}

              {isExternalPayment && (
                <>
                  {paymentSettings?.cashapp?.enabled && (
                    <div className="form-group">
                      <label htmlFor="cashapp">Payment will be received from (your payment username):</label>
                      <input
                        id="cashapp"
                        type="text"
                        value={cashAppUsername}
                        onChange={(e) => {
                          let value = e.target.value;
                          if (value && !value.startsWith('$')) {
                            value = '$' + value;
                          }
                          setCashAppUsername(value);
                          if (errors.cashAppUsername) {
                            setErrors({ ...errors, cashAppUsername: '' });
                          }
                        }}
                        placeholder="$username"
                        className={`form-input ${errors.cashAppUsername ? 'form-error' : ''}`}
                      />
                      {errors.cashAppUsername && (
                        <span className="error-message">
                          <AlertCircle size={14} />
                          {errors.cashAppUsername}
                        </span>
                      )}
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
                    After "Place Order" is clicked, you will get an order number. Put that in the memo.
                  </p>
                </>
              )}

              {isCreditPayment && (
                <div className="payment-credit-confirm">
                  <p>Your store credit balance of <strong>${creditBalance.toFixed(2)}</strong> will be used to pay for this order.</p>
                </div>
              )}

              {isInStorePayment && (
                <div className="payment-credit-confirm">
                  <p>You'll pay <strong>${total.toFixed(2)}</strong> when you arrive to pick up your order.</p>
                </div>
              )}
            </div>
          </div>

          <div className="checkout-section surface-card">
            <div className="section-header">
              <MapPin size={20} />
              <h3>Delivery Method</h3>
            </div>

            <div className="delivery-method-toggle delivery-method-toggle-large">
              <button
                type="button"
                onClick={() => !deliveryBlocked && setDeliveryMethod(DeliveryMethod.DELIVERY)}
                className={`toggle-btn ${isDelivery ? 'active' : ''} ${deliveryBlocked ? 'disabled' : ''}`}
                disabled={deliveryBlocked}
                title={deliveryBlocked ? deliveryBlockedReason : undefined}
              >
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod(DeliveryMethod.PICKUP)}
                className={`toggle-btn ${isPickup ? 'active' : ''}`}
              >
                Pick Up
              </button>
            </div>
            {deliveryBlocked && (
              <p className="delivery-blocked-hint">{deliveryBlockedReason}</p>
            )}

            {isDelivery ? (
              <div className="address-form">
                <div className="form-group">
                  <label htmlFor="street">Street Address *</label>
                  <input
                    id="street"
                    type="text"
                    value={address.street}
                    onChange={(e) => {
                      setAddress({ ...address, street: e.target.value });
                      clearAddressError('street');
                    }}
                    placeholder="123 Main Street"
                    className={`form-input ${errors.street ? 'form-error' : ''}`}
                  />
                  {errors.street && (
                    <span className="error-message">
                      <AlertCircle size={14} />
                      {errors.street}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="apartment">Apartment, Suite, etc. (Optional)</label>
                  <input
                    id="apartment"
                    type="text"
                    value={address.apartment}
                    onChange={(e) => {
                      setAddress({ ...address, apartment: e.target.value });
                      setErrors((prev) => ({ ...prev, deliveryEligibility: '' }));
                    }}
                    placeholder="Apt 4B"
                    className="form-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="city">City *</label>
                    <input
                      id="city"
                      type="text"
                      value={address.city}
                      onChange={(e) => {
                        setAddress({ ...address, city: e.target.value });
                        clearAddressError('city');
                      }}
                      placeholder="Houston"
                      className={`form-input ${errors.city ? 'form-error' : ''}`}
                    />
                    {errors.city && (
                      <span className="error-message">
                        <AlertCircle size={14} />
                        {errors.city}
                      </span>
                    )}
                  </div>

                  <div className="form-group form-group-state">
                    <label htmlFor="state">State *</label>
                    <select
                      id="state"
                      value={address.state}
                      onChange={(e) => {
                        setAddress({ ...address, state: e.target.value });
                        clearAddressError('state');
                      }}
                      className={`form-input ${errors.state ? 'form-error' : ''}`}
                    >
                      <option value="TX">TX</option>
                    </select>
                    {errors.state && (
                      <span className="error-message">
                        <AlertCircle size={14} />
                        {errors.state}
                      </span>
                    )}
                  </div>

                  <div className="form-group form-group-zip">
                    <label htmlFor="zipCode">ZIP Code *</label>
                    <input
                      id="zipCode"
                      type="text"
                      value={address.zipCode}
                      onChange={(e) => {
                        setAddress({ ...address, zipCode: e.target.value });
                        clearAddressError('zipCode');
                      }}
                      placeholder="77083"
                      className={`form-input ${errors.zipCode ? 'form-error' : ''}`}
                    />
                    {errors.zipCode && (
                      <span className="error-message">
                        <AlertCircle size={14} />
                        {errors.zipCode}
                      </span>
                    )}
                  </div>
                </div>

                {renderDeliveryEligibilityMessage()}

                {errors.deliveryEligibility && (
                  <span className="error-message">
                    <AlertCircle size={14} />
                    {errors.deliveryEligibility}
                  </span>
                )}
              </div>
            ) : (
              <div className="pickup-location-info">
                <h4>Store Pickup Location</h4>
                <p className="pickup-address">{pickupLocation || '123 Smoke Station Ave, Dallas, TX 75001'}</p>
                <p className="pickup-note">We'll email you when your order is ready for pickup.</p>
              </div>
            )}
          </div>

          <div className="checkout-section surface-card">
            <div className="section-header">
              <FileText size={20} />
              <h3>Special Instructions</h3>
              <span className="optional-badge">(Optional)</span>
            </div>
            <div className="form-group">
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Any special requests or delivery instructions?&#10;e.g., 'Ring doorbell', 'Leave at front door', etc."
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="checkout-sidebar">
          <div className="checkout-summary surface-card-accent">
            <h3 className="summary-title">Order Summary</h3>

            <div className="summary-details">
              <div className="summary-row">
                <span>Subtotal ({cart.length} {cart.length === 1 ? 'item' : 'items'})</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Tax ({(taxRate * 100).toFixed(2).replace(/\.00$/, '')}%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-row summary-total">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
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
                  : 'Place Order'}
            </button>

            <p className="checkout-note">{
              isCreditPayment ? 'Store credit will be deducted from your balance when you place this order.'
                : isInStorePayment ? 'Have your payment ready when you arrive to pick up your order.'
                  : 'By placing this order, you agree to send payment via the method(s) shown above'
            }</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CheckoutPage;
