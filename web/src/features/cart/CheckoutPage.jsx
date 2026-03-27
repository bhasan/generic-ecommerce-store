import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './CheckoutPage.css';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Package, MapPin, FileText, DollarSign, AlertCircle } from 'lucide-react';
import SendPaymentModal from '../../components/common/SendPaymentModal';
import { getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';
import HeaderDivider from '../../components/common/HeaderDivider';

// Helper to parse address string into components
const parseAddress = (addressStr) => {
  if (!addressStr) return { street: '', apartment: '', city: '', state: 'TX', zipCode: '' };

  // Try to parse address like "123 Main St, Apt 4B, City, TX 12345"
  const parts = addressStr.split(',').map(p => p.trim());

  if (parts.length >= 3) {
    // Check if second part looks like an apartment
    const hasApt = parts[1]?.toLowerCase().includes('apt') || parts[1]?.toLowerCase().includes('suite');

    if (hasApt && parts.length >= 4) {
      // Format: street, apt, city, state zip
      const stateZip = parts[3]?.split(' ') || [];
      return {
        street: parts[0] || '',
        apartment: parts[1]?.replace(/^(apt|suite)\s*/i, '') || '',
        city: parts[2] || '',
        state: stateZip[0] || 'TX',
        zipCode: stateZip[1] || ''
      };
    } else {
      // Format: street, city, state zip
      const stateZip = parts[2]?.split(' ') || [];
      return {
        street: parts[0] || '',
        apartment: '',
        city: parts[1] || '',
        state: stateZip[0] || 'TX',
        zipCode: stateZip[1] || ''
      };
    }
  }

  // Fallback - just put everything in street
  return { street: addressStr, apartment: '', city: '', state: 'TX', zipCode: '' };
};

function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, currentUser, checkout, deleteOrder, restoreCart, taxRate, pickupLocation, storeCashappUsername, paymentSettings } = useApp();
  const [deliveryMethod, setDeliveryMethod] = useState(location.state?.deliveryMethod || 'DELIVERY');
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: 'TX',
    zipCode: '',
    apartment: ''
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cashAppUsername, setCashAppUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSendPaymentModal, setShowSendPaymentModal] = useState(false);
  const [pendingOrderState, setPendingOrderState] = useState(null);
  const [orderCancelled, setOrderCancelled] = useState(false);
  const [errors, setErrors] = useState({});

  // Pre-populate address and CashApp from user profile
  useEffect(() => {
    if (currentUser) {
      // Parse and set address from user profile
      if (currentUser.address) {
        const parsedAddress = parseAddress(currentUser.address);
        setAddress(parsedAddress);
      }

      // Set CashApp username from user profile
      if (currentUser.cashapp) {
        setCashAppUsername(currentUser.cashapp);
      }
    }
  }, [currentUser]);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => {
    const unitPrice = getDiscountedUnitPrice(item, item.quantity);
    return sum + (unitPrice * item.quantity);
  }, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // Redirect if cart is empty and we haven't just placed or cancelled an order
  useEffect(() => {
    if (cart.length === 0 && !isSubmitting && !pendingOrderState && !showSendPaymentModal && !orderCancelled) {
      navigate('/cart');
    }
  }, [cart.length, isSubmitting, pendingOrderState, showSendPaymentModal, orderCancelled, navigate]);

  if (cart.length === 0 && !isSubmitting && !pendingOrderState && !showSendPaymentModal && !orderCancelled) {
    return null;
  }

  const validateForm = () => {
    const newErrors = {};

    if (deliveryMethod === 'DELIVERY') {
      if (!address.street.trim()) {
        newErrors.street = 'Street address is required';
      }

      if (!address.city.trim()) {
        newErrors.city = 'City is required';
      }

      if (!address.state.trim()) {
        newErrors.state = 'State is required';
      }

      if (!address.zipCode.trim()) {
        newErrors.zipCode = 'ZIP code is required';
      } else if (!/^\d{5}(-\d{4})?$/.test(address.zipCode)) {
        newErrors.zipCode = 'Invalid ZIP code format (e.g., 12345 or 12345-6789)';
      }
    }

    if (paymentSettings?.cashapp?.enabled) {
      if (!cashAppUsername.trim()) {
        newErrors.cashAppUsername = 'CashApp username is required';
      } else if (!cashAppUsername.startsWith('$')) {
        newErrors.cashAppUsername = 'CashApp username must start with $';
      } else if (cashAppUsername.length < 2 || cashAppUsername.length > 21) {
        newErrors.cashAppUsername = 'CashApp username must be between 1-20 characters (excluding $)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePlaceOrder = async () => {
    if (!validateForm()) {
      return;
    }

    // Prevent duplicate submissions
    setIsSubmitting(true);

    try {
      // Capture cart items before checkout clears them
      const itemsForSuccess = [...cart];

      // Call checkout function which creates order via API (pass CashApp for orders page)
      const newOrder = await checkout(cashAppUsername, deliveryMethod);

      // Format full address for display
      const fullAddress = [
        address.street,
        address.apartment ? `Apt ${address.apartment}` : '',
        `${address.city}, ${address.state} ${address.zipCode}`
      ].filter(Boolean).join('\n');

      const orderState = {
        order: newOrder,
        deliveryMethod,
        deliveryAddress: deliveryMethod === 'DELIVERY' ? fullAddress : 'Store Pickup',
        pickupLocation: deliveryMethod === 'PICKUP' ? pickupLocation : null,
        addressDetails: address,
        specialInstructions,
        cashAppUsername,
        subtotal,
        tax,
        total,
        items: itemsForSuccess
      };

      // Show send-payment modal before navigating to success page
      setPendingOrderState(orderState);
      setShowSendPaymentModal(true);
    } catch (error) {
      // Error is already handled in checkout function
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendPaymentDone = () => {
    setShowSendPaymentModal(false);
    if (pendingOrderState) {
      navigate('/order-success', { state: pendingOrderState });
      setPendingOrderState(null);
    }
  };

  const handleSendPaymentCancel = async () => {
    setOrderCancelled(true);
    if (pendingOrderState?.order?.id) {
      await deleteOrder(pendingOrderState.order.id, { silent: true });
    }
    if (pendingOrderState?.items?.length) {
      restoreCart(pendingOrderState.items);
    }
    setShowSendPaymentModal(false);
    setPendingOrderState(null);
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
        {/* Order Review Section */}
        <div className="checkout-main">
          <div className="checkout-section surface-card">
            <div className="section-header">
              <Package size={20} />
              <h3>Order Review</h3>
            </div>
            <div className="order-items-review">
              {cart.map(item => (
                (() => {
                  const imageSrc = getProductImageSrc(item);
                  return (
                    <div key={item.id} className="checkout-item">
                      <ProductImage
                        src={imageSrc}
                        alt={item.name}
                        className="checkout-item-image"
                      />
                      <div className="checkout-item-details">
                        <h4>{item.name}</h4>
                        <p className="checkout-item-category">{getProductCategoryLabel(item)}</p>
                        <p className="checkout-item-price">
                          ${getDiscountedUnitPrice(item, item.quantity).toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <div className="checkout-item-total">
                        ${(getDiscountedUnitPrice(item, item.quantity) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          </div>

          {/* Payment Section */}
          <div className="checkout-section surface-card">
            <div className="section-header">
              <DollarSign size={20} />
              <h3>Payment Information</h3>
            </div>
            <div className="payment-info-box">
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
            </div>
          </div>

          {/* Delivery Address Section */}
          <div className="checkout-section surface-card">
            <div className="section-header">
              <MapPin size={20} />
              <h3>Delivery Method</h3>
            </div>

            <div className="delivery-method-toggle delivery-method-toggle-large">
              <button
                type="button"
                onClick={() => setDeliveryMethod('DELIVERY')}
                className={`toggle-btn ${deliveryMethod === 'DELIVERY' ? 'active' : ''}`}
              >
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod('PICKUP')}
                className={`toggle-btn ${deliveryMethod === 'PICKUP' ? 'active' : ''}`}
              >
                Pick Up
              </button>
            </div>

            {deliveryMethod === 'DELIVERY' ? (
              <div className="address-form">
                <div className="form-group">
                  <label htmlFor="street">Street Address *</label>
                  <input
                    id="street"
                    type="text"
                    value={address.street}
                    onChange={(e) => {
                      setAddress({ ...address, street: e.target.value });
                      if (errors.street) {
                        setErrors({ ...errors, street: '' });
                      }
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
                    onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
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
                        if (errors.city) {
                          setErrors({ ...errors, city: '' });
                        }
                      }}
                      placeholder="New York"
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
                        if (errors.state) {
                          setErrors({ ...errors, state: '' });
                        }
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
                        if (errors.zipCode) {
                          setErrors({ ...errors, zipCode: '' });
                        }
                      }}
                      placeholder="10001"
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
              </div>
            ) : (
              <div className="pickup-location-info">
                <h4>Store Pickup Location</h4>
                <p className="pickup-address">{pickupLocation || '123 Smoke Station Ave, Dallas, TX 75001'}</p>
                <p className="pickup-note">We'll email you when your order is ready for pickup.</p>
              </div>
            )}
          </div>

          {/* Special Instructions Section */}
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

        {/* Order Summary Sidebar */}
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
              disabled={isSubmitting}
              className="btn-place-order"
            >
              {isSubmitting ? 'Processing...' : 'Place Order'}
            </button>

            <p className="checkout-note">
              By placing this order, you agree to send payment via the method(s) shown above
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CheckoutPage;