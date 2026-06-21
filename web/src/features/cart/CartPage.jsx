import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CartPage.css';
import { useApp } from '../../context/AppContext';
import { DeliveryMethod } from '../../constants/orderMethods';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { getAllowedQuantities, getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';
import HeaderDivider from '../../components/common/HeaderDivider';

function CartPage() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateCartQuantity, taxRate, minimumDeliveryOrder, minimumDeliveryOrderEnabled, deliveryDisabled, deliveryDisabledMessage } = useApp();
  const [deliveryMethod, setDeliveryMethod] = useState(DeliveryMethod.PICKUP);
  const total = cart.reduce((sum, item) => {
    const unitPrice = getDiscountedUnitPrice(item, item.quantity);
    return sum + (unitPrice * item.quantity);
  }, 0);
  const deliveryBlocked = deliveryDisabled || (minimumDeliveryOrderEnabled && total < minimumDeliveryOrder);

  useEffect(() => {
    if (deliveryBlocked && deliveryMethod === DeliveryMethod.DELIVERY) {
      setDeliveryMethod(DeliveryMethod.PICKUP);
    }
  }, [deliveryBlocked, deliveryMethod]);


  if (cart.length === 0) {
    return (
      <div className="cart-empty-container">
        <div className="cart-empty-content">
          <ShoppingCart size={64} className="cart-empty-icon" />
          <h2 className="cart-empty-title">Your cart is empty</h2>
          <p className="cart-empty-subtitle">Add some products to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page-container">
      <div className="cart-header section-header-surface">
        <div>
          <h2 className="page-title">Shopping Cart</h2>
          <p className="page-subtitle">{cart.length} {cart.length === 1 ? 'item' : 'items'} in your cart</p>
        </div>
      </div>
      <HeaderDivider />

      <div className="cart-content">
        <div className="cart-items">
          {cart.map(item => (
            (() => {
              const imageSrc = getProductImageSrc(item);
              const allowed = getAllowedQuantities(item);
              const unitPrice = getDiscountedUnitPrice(item, item.quantity);
              return (
                <div key={item.variantId} className="cart-item surface-card">
                  <div className="cart-item-image-container">
                    <ProductImage src={imageSrc} alt={item.name} className="cart-item-image" />
                  </div>

                  <div className="cart-item-details">
                    <h3 className="cart-item-name">{item.name}</h3>
                    {item.variantLabel && item.variantLabel !== 'Default' && (
                      <p className="cart-item-variant">{item.variantLabel}</p>
                    )}
                    <p className="cart-item-price">
                      ${unitPrice.toFixed(2)} each
                    </p>
                  </div>

                  <div className="cart-item-actions">
                    {allowed.length > 0 ? (
                      <div className="quantity-controls">
                        <select
                          className="quantity-select"
                          value={item.quantity}
                          onChange={(e) => updateCartQuantity(item.variantId, parseFloat(e.target.value))}
                        >
                          {allowed.map((qty) => (
                            <option key={qty} value={qty}>{qty}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="quantity-controls">
                        <button
                          onClick={() => updateCartQuantity(item.variantId, item.quantity - 1)}
                          className="quantity-btn"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="quantity-display">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.variantId, item.quantity + 1)}
                          className="quantity-btn"
                          aria-label="Increase quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    )}

                    <div className="cart-item-total">
                      ${(unitPrice * item.quantity).toFixed(2)}
                    </div>

                    <button
                      onClick={() => removeFromCart(item.variantId)}
                      className="btn-remove-item"
                      aria-label="Remove item"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              );
            })()
          ))}
        </div>

        <div className="cart-summary surface-card-accent">
          <h3 className="cart-summary-title">Order Summary</h3>

          <div className="delivery-method-toggle delivery-method-toggle-large">
            <button
              onClick={() => !deliveryBlocked && setDeliveryMethod(DeliveryMethod.DELIVERY)}
              className={`toggle-btn ${deliveryMethod === DeliveryMethod.DELIVERY ? 'active' : ''} ${deliveryBlocked ? 'disabled' : ''}`}
              disabled={deliveryBlocked}
              title={deliveryBlocked ? (deliveryDisabled ? (deliveryDisabledMessage || 'Delivery is currently unavailable.') : `Add $${(minimumDeliveryOrder - total).toFixed(2)} more for delivery`) : undefined}
            >
              Delivery
            </button>
            <button
              onClick={() => setDeliveryMethod(DeliveryMethod.PICKUP)}
              className={`toggle-btn ${deliveryMethod === DeliveryMethod.PICKUP ? 'active' : ''}`}
            >
              Pick Up
            </button>
          </div>

          {deliveryBlocked && (
            <div className="minimum-order-notice">
              {deliveryDisabled
                ? (deliveryDisabledMessage || 'Delivery is currently unavailable.')
                : `Delivery requires a $${minimumDeliveryOrder.toFixed(2)} minimum ($${(minimumDeliveryOrder - total).toFixed(2)} more needed)`}
            </div>
          )}

          <div className="cart-summary-details">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Tax (estimated)</span>
              <span>${(total * taxRate).toFixed(2)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>${(total * (1 + taxRate)).toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/checkout', { state: { deliveryMethod } })}
            className="btn-checkout"
          >
            Proceed to Checkout
          </button>

          <p className="checkout-note">
            Secure checkout powered by our payment processor
          </p>
        </div>
      </div>
    </div>
  );
}

export default CartPage;