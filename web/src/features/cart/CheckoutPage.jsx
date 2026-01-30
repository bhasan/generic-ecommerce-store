import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CheckoutPage.css';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Package, MapPin, FileText, DollarSign, AlertCircle } from 'lucide-react';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';
import HeaderDivider from '../../components/common/HeaderDivider';

function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, currentUser, checkout } = useApp();
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: 'TX',
    zipCode: '',
    apartment: ''
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [cashAppUsername, setCashAppUsername] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errors, setErrors] = useState({});

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => {
    const unitPrice = getDiscountedUnitPrice(item, item.quantity);
    return sum + (unitPrice * item.quantity);
  }, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  // Redirect if cart is empty
  if (cart.length === 0) {
    navigate('/cart');
    return null;
  }

  const validateForm = () => {
    const newErrors = {};

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

    if (!cashAppUsername.trim()) {
      newErrors.cashAppUsername = 'CashApp username is required';
    } else if (!cashAppUsername.startsWith('$')) {
      newErrors.cashAppUsername = 'CashApp username must start with $';
    } else if (cashAppUsername.length < 2 || cashAppUsername.length > 21) {
      newErrors.cashAppUsername = 'CashApp username must be between 1-20 characters (excluding $)';
    }

    if (!paymentConfirmed) {
      newErrors.paymentConfirmed = 'Please confirm payment information';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePlaceOrder = () => {
    if (!validateForm()) {
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const confirmOrder = async () => {
    // Prevent duplicate submissions
    setIsSubmitting(true);
    setShowConfirmModal(false);

    try {
      // Call checkout function which creates order via API
      const newOrder = await checkout();
      
      // Format full address for display
      const fullAddress = [
        address.street,
        address.apartment ? `Apt ${address.apartment}` : '',
        `${address.city}, ${address.state} ${address.zipCode}`
      ].filter(Boolean).join('\n');

      // Navigate to success page with order data from API and additional checkout details
      navigate('/order-success', {
        state: {
          order: newOrder, // Order from API
          deliveryAddress: fullAddress,
          addressDetails: address,
          specialInstructions,
          cashAppUsername,
          subtotal,
          tax,
          total,
          items: cart
        }
      });
    } catch (error) {
      // Error is already handled in checkout function
      setIsSubmitting(false);
      // Don't navigate on error
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

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmOrder}
        title="Confirm Your Order"
        type="info"
        confirmText="Place Order"
        cancelText="Review Again"
        message={
          <div className="order-confirmation-details">
            <p><strong>Order Total:</strong> ${total.toFixed(2)}</p>
            <p><strong>Your CashApp Username:</strong> {cashAppUsername}</p>
            <p><strong>Delivery to:</strong></p>
            <p style={{ marginLeft: '1rem', fontSize: '0.9rem' }}>
              {address.street}
              {address.apartment && <><br />Apt {address.apartment}</>}
              <br />{address.city}, {address.state} {address.zipCode}
            </p>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>
              Please review your information carefully before confirming.
            </p>
          </div>
        }
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
              <p className="payment-instructions">
                Please send payment via CashApp. Enter your CashApp username below so we can confirm receipt of payment:
              </p>
              <div className="form-group">
                <label htmlFor="cashapp">CashApp Username</label>
                <input
                  id="cashapp"
                  type="text"
                  value={cashAppUsername}
                  onChange={(e) => {
                    let value = e.target.value;
                    // Auto-add $ if not present
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
                {cashAppUsername && !errors.cashAppUsername && (
                  <p className="payment-preview">
                    Payment will be received from: <strong>{cashAppUsername}</strong>
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={paymentConfirmed}
                    onChange={(e) => {
                      setPaymentConfirmed(e.target.checked);
                      if (errors.paymentConfirmed) {
                        setErrors({ ...errors, paymentConfirmed: '' });
                      }
                    }}
                  />
                  <span>I confirm that I will send payment from the CashApp username provided above</span>
                </label>
                {errors.paymentConfirmed && (
                  <span className="error-message">
                    <AlertCircle size={14} />
                    {errors.paymentConfirmed}
                  </span>
                )}
              </div>

              <div className="payment-warning">
                <AlertCircle size={16} />
                <p>If payment is not received, your order will be canceled.</p>
              </div>
            </div>
          </div>

          {/* Delivery Address Section */}
          <div className="checkout-section surface-card">
            <div className="section-header">
              <MapPin size={20} />
              <h3>Delivery Address</h3>
            </div>
            
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
                <span>Shipping</span>
                <span className="shipping-free">Free</span>
              </div>
              <div className="summary-row">
                <span>Tax (8%)</span>
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
              By placing this order, you agree to send payment via CashApp
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CheckoutPage;