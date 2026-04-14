import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './OrderSuccessPage.css';
import { useApp } from '../../context/AppContext';
import { DeliveryMethod, PaymentMethod } from '../../constants/orderMethods';
import { CheckCircle, Package, MapPin, DollarSign, MessageCircle, ShoppingBag, Eye } from 'lucide-react';
import { getProductImageSrc } from '../products/productsHelpers';
import ProductImage from '../products/ProductImage';

function OrderSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCart } = useApp();
  const orderData = location.state;

  useEffect(() => {
    // If no order data, redirect to products
    if (!orderData) {
      navigate('/products');
      return undefined;
    }
    setCart([]);
    return undefined;
  }, [orderData, navigate, setCart]);

  if (!orderData) {
    return null;
  }

  const orderId = orderData.order?.id || 'Pending';
  const orderDate = new Date(orderData.order?.createdAt || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Placeholder for WhatsApp number (to be populated later)
  const whatsappNumber = 'XXXXXXXXXX'; // Will be populated later

  return (
    <div className="order-success-container">
      <div className="success-header">
        <div className="success-icon-wrapper">
          <CheckCircle size={64} className="success-icon" />
        </div>
        <h1 className="success-title">Order Placed Successfully!</h1>
        <p className="success-subtitle">Thank you for your order</p>
      </div>

      <div className="order-success-content">
        {/* Order ID Section */}
        <div className="order-id-card">
          <div className="order-id-label">Order ID</div>
          <div className="order-id-number">
            {typeof orderId === 'number' ? `#${orderId.toString().padStart(6, '0')}` : orderId}
          </div>
          <div className="order-date">{orderDate}</div>
        </div>

        {/* Order Details */}
        <div className="order-details-section">
          <h2 className="section-title">Order Details</h2>
          
          <div className="detail-card surface-card">
            <div className="detail-header">
              <Package size={20} />
              <h3>Items Ordered</h3>
            </div>
            <div className="order-items-list">
              {orderData.items.map((item, index) => (
                (() => {
                  const imageSrc = getProductImageSrc(item);
                  return (
                <div key={index} className="order-success-item">
                  <ProductImage
                    src={imageSrc}
                    alt={item.name}
                    className="success-item-image"
                  />
                  <div className="success-item-details">
                    <h4>{item.name}</h4>
                    <p>Quantity: {item.quantity}</p>
                  </div>
                  <div className="success-item-price">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
                  );
                })()
              ))}
            </div>
            
            <div className="order-total-summary">
              <div className="total-row">
                <span>Subtotal</span>
                <span>${orderData.subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Tax</span>
                <span>${orderData.tax.toFixed(2)}</span>
              </div>
              <div className="total-divider"></div>
              <div className="total-row total-final">
                <span>Total</span>
                <span>${orderData.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="detail-card surface-card">
            <div className="detail-header">
              <MapPin size={20} />
              <h3>{orderData.deliveryMethod === DeliveryMethod.PICKUP ? 'Pickup Location' : 'Delivery Address'}</h3>
            </div>
            <p className="detail-text">{orderData.deliveryAddress}</p>
          </div>

          {orderData.specialInstructions && (
            <div className="detail-card surface-card">
              <div className="detail-header">
                <Package size={20} />
                <h3>Special Instructions</h3>
              </div>
              <p className="detail-text">{orderData.specialInstructions}</p>
            </div>
          )}

          <div className="detail-card surface-card">
            <div className="detail-header">
              <DollarSign size={20} />
              <h3>Payment Information</h3>
            </div>
            {orderData.paymentMethod === PaymentMethod.IN_STORE ? (
              <p className="detail-text">
                Pay <strong>${orderData.total.toFixed(2)}</strong> when you arrive to pick up your order.
              </p>
            ) : orderData.paymentMethod === PaymentMethod.CREDIT ? (
              <p className="detail-text">
                Paid with store credit.
              </p>
            ) : (
              <p className="detail-text">
                Payment will be sent to CashApp: <strong>{orderData.cashAppUsername}</strong>
              </p>
            )}
          </div>
        </div>

        {/* What's Next Section */}
        <div className="whats-next-section">
          <h2 className="section-title">What's Next?</h2>
          
          <div className="whats-next-card surface-card">
            {orderData.paymentMethod === PaymentMethod.IN_STORE ? (
              <>
                <div className="next-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Wait for Pickup Notification</h4>
                    <p>We'll email you when your order is ready for pickup.</p>
                  </div>
                </div>

                <div className="next-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Come Pick Up Your Order</h4>
                    <p>Head to the store and bring your payment of <strong>${orderData.total.toFixed(2)}</strong>.</p>
                  </div>
                </div>

                <div className="next-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Pay at the Store</h4>
                    <p>Pay when you arrive and your order will be handed to you.</p>
                  </div>
                </div>
              </>
            ) : orderData.deliveryMethod === DeliveryMethod.PICKUP ? (
              <>
                {orderData.paymentMethod === PaymentMethod.EXTERNAL && (
                  <div className="next-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <h4>Send Payment</h4>
                      <p>Please send <strong>${orderData.total.toFixed(2)}</strong> to <strong>{orderData.cashAppUsername}</strong> via CashApp.</p>
                    </div>
                  </div>
                )}

                <div className="next-step">
                  <div className="step-number">{orderData.paymentMethod === PaymentMethod.EXTERNAL ? 2 : 1}</div>
                  <div className="step-content">
                    <h4>Wait for Pickup Notification</h4>
                    <p>We'll notify you when your order is ready for pickup.</p>
                  </div>
                </div>

                <div className="next-step">
                  <div className="step-number">{orderData.paymentMethod === PaymentMethod.EXTERNAL ? 3 : 2}</div>
                  <div className="step-content">
                    <h4>Come Pick Up Your Order</h4>
                    <p>Head to the store at <strong>{orderData.pickupLocation}</strong> to collect your order.</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {orderData.paymentMethod === PaymentMethod.EXTERNAL && (
                  <div className="next-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <h4>Send Payment</h4>
                      <p>Please send <strong>${orderData.total.toFixed(2)}</strong> to <strong>{orderData.cashAppUsername}</strong> via CashApp.</p>
                    </div>
                  </div>
                )}

                <div className="next-step">
                  <div className="step-number">{orderData.paymentMethod === PaymentMethod.EXTERNAL ? 2 : 1}</div>
                  <div className="step-content">
                    <h4>Contact Us on WhatsApp</h4>
                    <p>Message us on WhatsApp to confirm your order{orderData.paymentMethod === PaymentMethod.EXTERNAL ? ' and payment' : ''}.</p>
                    <div className="whatsapp-contact">
                      <MessageCircle size={18} />
                      <span className="whatsapp-number">{whatsappNumber}</span>
                      <span className="coming-soon">(Number will be added soon)</span>
                    </div>
                  </div>
                </div>

                <div className="next-step">
                  <div className="step-number">{orderData.paymentMethod === PaymentMethod.EXTERNAL ? 3 : 2}</div>
                  <div className="step-content">
                    <h4>Track Your Delivery</h4>
                    <p>Once confirmed, we'll prepare your order and arrange delivery to <strong>{orderData.deliveryAddress}</strong>.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="success-actions">
          <button
            onClick={() => navigate('/orders')}
            className="btn-view-orders"
          >
            <Eye size={20} />
            View My Orders
          </button>
          <button
            onClick={() => navigate('/products')}
            className="btn-continue-shopping"
          >
            <ShoppingBag size={20} />
            Continue Shopping
          </button>
        </div>

        {/* Order Confirmation Note */}
        <div className="confirmation-note">
          <p>A confirmation of your order has been recorded in your account. You can view and track your order status anytime from the Orders page.</p>
        </div>
      </div>
    </div>
  );
}

export default OrderSuccessPage;
