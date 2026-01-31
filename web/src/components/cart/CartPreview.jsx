import React, { useRef, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProductImage from '../../features/products/ProductImage';
import { getProductImageSrc } from '../../features/products/productsHelpers';
import './CartPreview.css';

function CartPreview({ cart, cartCount }) {
  const [open, setOpen] = React.useState(false);
  const cartRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (cartRef.current && !cartRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="cart-preview" ref={cartRef}>
      <button
        type="button"
        className="cart-button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="View cart preview"
      >
        <ShoppingCart size={22} />
        {cartCount > 0 && (
          <span className="cart-badge">{cartCount}</span>
        )}
      </button>
      {open && (
        <div className="cart-dropdown">
          <div className="cart-dropdown-header">
            <span>Cart</span>
            <span className="cart-dropdown-count">
              {cartCount} {cartCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          {cart.length === 0 ? (
            <div className="cart-dropdown-empty">Your cart is empty.</div>
          ) : (
            <div className="cart-dropdown-items">
              {cart.slice(0, 4).map((item) => (
                <div key={item.id} className="cart-dropdown-item">
                  <ProductImage
                    src={getProductImageSrc(item)}
                    alt={item.name}
                    className="cart-dropdown-image"
                  />
                  <div className="cart-dropdown-info">
                    <span className="cart-dropdown-name">{item.name}</span>
                    <span className="cart-dropdown-qty">Qty: {item.quantity}</span>
                  </div>
                </div>
              ))}
              {cart.length > 4 && (
                <div className="cart-dropdown-more">
                  +{cart.length - 4} more items
                </div>
              )}
            </div>
          )}
          <div className="cart-dropdown-buttons">
            <button
              type="button"
              className="cart-dropdown-button"
              onClick={() => {
                setOpen(false);
                navigate('/cart');
              }}
            >
              View Cart
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                className="cart-dropdown-button cart-dropdown-button-checkout"
                onClick={() => {
                  setOpen(false);
                  navigate('/checkout');
                }}
              >
                Checkout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CartPreview;
