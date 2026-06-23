import React, { useEffect, useReducer, useRef, useState } from 'react';
import { checkoutFlowReducer, initialCheckoutFlow, CheckoutFlowState } from './checkout/checkoutMachine';
import { useNavigate, useLocation } from 'react-router-dom';
import './CheckoutPage.css';
import { useApp } from '../../context/AppContext';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';
import { ArrowLeft, Package, MapPin, FileText, DollarSign, AlertTriangle, RefreshCw } from 'lucide-react';
import SendPaymentModal from '../../components/common/SendPaymentModal';
import AuthorizeNetPaymentModal from './AuthorizeNetPaymentModal';
import * as ordersApi from '../../services/ordersApi';
import { getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';
import HeaderDivider from '../../components/common/HeaderDivider';
import {
  formatDeliveryAddress,
  isDeliveryAddressComplete,
  normalizeDeliveryAddress,
  parseAddress,
} from '../../utils/address';
import { getFulfillmentEntry } from './checkout/fulfillmentRegistry';
import { getPaymentEntry } from './checkout/paymentRegistry';
import ErrorMessage from './checkout/ErrorMessage';
import PaymentSelector from './checkout/PaymentSelector';
import PaymentDetails from './checkout/PaymentDetails';
import FulfillmentSelector from './checkout/FulfillmentSelector';

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
  const [vehicleDetails, setVehicleDetails] = useState({ makeModel: '', color: '' });
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
  const [flow, dispatchFlow] = useReducer(checkoutFlowReducer, initialCheckoutFlow);
  const [errors, setErrors] = useState({});
  const [deliveryEligibility, setDeliveryEligibility] = useState(createInitialEligibilityState);
  const latestEligibilityRequestRef = useRef(0);
  const prefilledAddressKeyRef = useRef('');
  const hasUsedImmediatePrefillCheckRef = useRef(false);

  const isSubmitting = flow.state === CheckoutFlowState.SUBMITTING;
  const showSendPaymentModal = flow.state === CheckoutFlowState.AWAITING_PAYMENT;
  const pendingOrderState = flow.state === CheckoutFlowState.AWAITING_PAYMENT ? flow.orderState : null;
  const orderCancelled = flow.state === CheckoutFlowState.CANCELLED;
  const orderCompleted = flow.state === CheckoutFlowState.SUCCESS;
  const ccPaymentModal = flow.state === CheckoutFlowState.CC_PAYMENT ? flow.ccModal : null;
  const paymentRetryOrder = flow.state === CheckoutFlowState.RETRY ? flow.retryOrder : null;

  const isPickup = deliveryMethod === DeliveryMethod.PICKUP || deliveryMethod === DeliveryMethod.CURBSIDE;
  const isDelivery = deliveryMethod === DeliveryMethod.DELIVERY;
  const isStoreCreditPayment = selectedPaymentMethod === PaymentMethod.STORE_CREDIT;
  const isInStorePayment = selectedPaymentMethod === PaymentMethod.IN_STORE;
  const isExternalPayment = selectedPaymentMethod === PaymentMethod.EXTERNAL;
  const isCCPayment = selectedPaymentMethod === PaymentMethod.CC;
  const showPaymentSelector = creditBalance > 0 || isPickup || paymentSettings?.cc_payment?.enabled;

  const clearVehicleError = (fieldName) => {
    setErrors((prev) => ({
      ...prev,
      [fieldName]: '',
    }));
  };

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
    if (cart.length === 0 && flow.state === CheckoutFlowState.EDITING) {
      navigate('/cart');
    }
  }, [cart.length, flow.state, navigate]);

  useEffect(() => {
    if (flow.state === CheckoutFlowState.SUCCESS && flow.orderState) {
      navigate('/order-success', { state: flow.orderState });
    }
  }, [flow.state, flow.orderState, navigate]);

  if (cart.length === 0 && flow.state === CheckoutFlowState.EDITING) {
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

  // Validates all form fields through the fulfillment and payment registries.
  const validateForm = () => {
    const fulfillmentCtx = {
      normalizedAddress,
      vehicleDetails,
      deliveryMinimumBlocked,
      minimumDeliveryOrder,
      deliveryAddressComplete,
      deliveryEligibility,
    };
    const paymentCtx = {
      paymentSettings,
      cashAppUsername,
      creditBalance,
      total,
      isPickup,
    };

    let newErrors = {};
    getFulfillmentEntry(deliveryMethod)?.validate(fulfillmentCtx, newErrors);
    getPaymentEntry(selectedPaymentMethod)?.validate(paymentCtx, newErrors);

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Places the order, preserves a restorable cart snapshot, and branches correctly for external-payment flows.
  const handlePlaceOrder = async () => {
    if (!validateForm()) return;

    dispatchFlow({ type: 'SUBMIT' });

    try {
      const itemsForSuccess = [...cart];
      const fulfillmentCtx = { normalizedAddress, vehicleDetails };
      const fulfillmentPayload = getFulfillmentEntry(deliveryMethod)?.buildPayload(fulfillmentCtx) ?? {};

      const newOrder = await checkout(
        cashAppUsername,
        deliveryMethod,
        selectedPaymentMethod,
        fulfillmentPayload.deliveryAddress,
        fulfillmentPayload.vehicleDescription,
      );

      const orderState = {
        order: newOrder,
        deliveryMethod,
        deliveryAddress: isDelivery
          ? (newOrder.deliveryAddress || formatDeliveryAddress(normalizedAddress))
          : deliveryMethod === DeliveryMethod.CURBSIDE
            ? `${vehicleDetails.color.trim()} ${vehicleDetails.makeModel.trim()}`
            : 'Store Pickup',
        pickupLocation: isPickup ? pickupLocation : null,
        addressDetails: normalizedAddress,
        specialInstructions,
        cashAppUsername,
        subtotal,
        tax,
        total,
        items: itemsForSuccess,
        paymentMethod: selectedPaymentMethod,
        paymentSnapshot: selectedPaymentMethod === PaymentMethod.EXTERNAL ? {
          methods: Object.entries(paymentSettings || {})
            .filter(([, cfg]) => cfg?.enabled && cfg?.handle)
            .map(([type, cfg]) => ({ type, label: { cashapp: 'CashApp', zelle: 'Zelle', venmo: 'Venmo' }[type] ?? type, handle: cfg.handle })),
          senderHandle: cashAppUsername || null,
        } : null,
      };

      if (isCCPayment) {
        try {
          const { token, paymentFormUrl } = await ordersApi.getPaymentToken(newOrder.id);
          dispatchFlow({
            type: 'ORDER_CREATED_CC',
            orderState,
            ccModal: { token, paymentFormUrl, orderId: newOrder.id, amount: total, items: itemsForSuccess },
          });
        } catch {
          try {
            await deleteOrder(newOrder.id, { silent: true });
          } finally {
            restoreCart(itemsForSuccess);
            dispatchFlow({ type: 'SUBMIT_ERROR' });
            setErrors((prev) => ({ ...prev, payment: 'Could not initialize card payment. Please try again.' }));
          }
        }
        return;
      }

      if (isExternalPayment) {
        dispatchFlow({ type: 'ORDER_CREATED_EXTERNAL', orderState });
      } else {
        dispatchFlow({ type: 'ORDER_CREATED_IMMEDIATE', orderState });
      }
    } catch {
      // Error is already handled in AppContext.
      dispatchFlow({ type: 'SUBMIT_ERROR' });
    }
  };

  // Finalizes the external-payment handoff after the user confirms they sent payment.
  const handleSendPaymentDone = () => {
    dispatchFlow({ type: 'EXTERNAL_PAYMENT_CONFIRMED' });
    if (pendingOrderState) {
      navigate('/order-success', { state: pendingOrderState });
    }
  };

  // Cancels the pending external-payment order and restores the cart even if deleteOrder fails.
  const handleSendPaymentCancel = async () => {
    const snapshot = pendingOrderState;
    dispatchFlow({ type: 'CANCEL' });
    try {
      if (snapshot?.order?.id) {
        await deleteOrder(snapshot.order.id, { silent: true });
      }
    } catch {
      // Cancellation should still restore the cart even if cleanup fails.
    } finally {
      if (snapshot?.items?.length) {
        restoreCart(snapshot.items);
      }
    }
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

      {ccPaymentModal && (
        <AuthorizeNetPaymentModal
          orderId={ccPaymentModal.orderId}
          token={ccPaymentModal.token}
          paymentFormUrl={ccPaymentModal.paymentFormUrl}
          amount={ccPaymentModal.amount}
          onSuccess={() => {
            dispatchFlow({ type: 'PAYMENT_CONFIRMED' });
          }}
          onFailure={(reason) => {
            dispatchFlow({
              type: 'PAYMENT_FAILED',
              retryOrder: {
                orderId: ccPaymentModal.orderId,
                amount: ccPaymentModal.amount,
                items: ccPaymentModal.items,
                orderState: flow.orderState,
                reason,
              },
            });
          }}
          onClose={() => {
            dispatchFlow({
              type: 'PAYMENT_FAILED',
              retryOrder: {
                orderId: ccPaymentModal.orderId,
                amount: ccPaymentModal.amount,
                items: ccPaymentModal.items,
                orderState: flow.orderState,
                reason: 'Payment not completed — you can retry below.',
              },
            });
          }}
        />
      )}

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
                onCashAppChange={(value) => {
                  setCashAppUsername(value);
                  setErrors((prev) => ({ ...prev, cashAppUsername: '' }));
                }}
                creditBalance={creditBalance}
                total={total}
                errors={errors}
              />
              <ErrorMessage message={errors.payment} />
            </div>
          </div>

          <div className="checkout-section surface-card">
            <div className="section-header">
              <MapPin size={20} />
              <h3>Delivery Method</h3>
            </div>
            <FulfillmentSelector
              deliveryMethod={deliveryMethod}
              onDeliveryMethodChange={setDeliveryMethod}
              address={address}
              onAddressChange={setAddress}
              vehicleDetails={vehicleDetails}
              onVehicleDetailsChange={setVehicleDetails}
              errors={errors}
              onClearAddressError={clearAddressError}
              onClearVehicleError={clearVehicleError}
              deliveryBlocked={deliveryBlocked}
              deliveryBlockedReason={deliveryBlockedReason}
              deliveryRadiusMiles={deliveryRadiusMiles}
              deliveryAddressComplete={deliveryAddressComplete}
              deliveryEligibility={deliveryEligibility}
              pickupLocation={pickupLocation}
            />
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
        </div>
      </div>

      {paymentRetryOrder && (
        <div className="checkout-retry-overlay">
          <div className="payment-retry-card">
            <div className="payment-retry-icon"><AlertTriangle size={28} /></div>
            <h3>Payment Unsuccessful</h3>
            <p>{paymentRetryOrder.reason || 'Your card could not be processed. Your order has been saved.'}</p>
            <div className="payment-retry-order-info">
              <span>Order #{paymentRetryOrder.orderId}</span>
              <span>Total: ${paymentRetryOrder.amount?.toFixed(2)}</span>
            </div>
            <div className="payment-retry-actions">
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    const { token, paymentFormUrl } = await ordersApi.getPaymentToken(paymentRetryOrder.orderId);
                    dispatchFlow({
                      type: 'ORDER_CREATED_CC',
                      orderState: paymentRetryOrder.orderState,
                      ccModal: {
                        token,
                        paymentFormUrl,
                        orderId: paymentRetryOrder.orderId,
                        amount: paymentRetryOrder.amount,
                        items: paymentRetryOrder.items,
                      },
                    });
                  } catch {
                    setErrors((prev) => ({ ...prev, payment: 'Could not retry payment. Please contact support.' }));
                  }
                }}
              >
                <RefreshCw size={16} /> Retry Card Payment
              </button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await deleteOrder(paymentRetryOrder.orderId, { silent: true });
                  } catch {
                    // Restore the cart even if cleanup fails — matches handleSendPaymentCancel.
                  } finally {
                    if (paymentRetryOrder.items?.length) {
                      restoreCart(paymentRetryOrder.items);
                    }
                    dispatchFlow({ type: 'SUBMIT_ERROR' });
                    setSelectedPaymentMethod(PaymentMethod.EXTERNAL);
                  }
                }}
              >
                Switch to CashApp / Zelle / Venmo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CheckoutPage;
