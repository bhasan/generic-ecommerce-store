import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CartPage.css';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { getDiscountedUnitPrice, getProductCategoryLabel, getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';

function CartPage() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateCartQuantity } = useApp();
  const total = cart.reduce((sum, item) => {
    const unitPrice = getDiscountedUnitPrice(item, item.quantity);
    return sum + (unitPrice * item.quantity);
  }, 0);

  const resolveAllowedQuantities = (item) => {
    if (item.allowedQuantitiesOverride && item.allowedQuantitiesOverride.length > 0) {
      return item.allowedQuantitiesOverride;
    }
    return item.category?.allowedQuantities || [];
  };

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

      <div className="cart-content">
        <div className="cart-items">
          {cart.map(item => (
            (() => {
              const imageSrc = getProductImageSrc(item);
              return (
            <div key={item.id} className="cart-item surface-card">
              <div className="cart-item-image-container">
                <ProductImage src={imageSrc} alt={item.name} className="cart-item-image" />
              </div>

              <div className="cart-item-details">
                <h3 className="cart-item-name">{item.name}</h3>
                <p className="cart-item-category">{getProductCategoryLabel(item)}</p>
                <p className="cart-item-price">
                  ${getDiscountedUnitPrice(item, item.quantity).toFixed(2)} each
                </p>
              </div>

              <div className="cart-item-actions">
                {resolveAllowedQuantities(item).length > 0 ? (
                  <div className="quantity-controls">
                    <select
                      className="quantity-select"
                      value={item.quantity}
                      onChange={(e) => updateCartQuantity(item.id, parseFloat(e.target.value))}
                    >
                      {resolveAllowedQuantities(item).map((quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="quantity-controls">
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                      className="quantity-btn"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="quantity-display">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                      className="quantity-btn"
                      aria-label="Increase quantity"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}

                <div className="cart-item-total">
                  ${(getDiscountedUnitPrice(item, item.quantity) * item.quantity).toFixed(2)}
                </div>

                <button
                  onClick={() => removeFromCart(item.id)}
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
          
          <div className="cart-summary-details">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span className="shipping-free">Free</span>
            </div>
            <div className="summary-row">
              <span>Tax (estimated)</span>
              <span>${(total * 0.08).toFixed(2)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>${(total * 1.08).toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/checkout')}
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