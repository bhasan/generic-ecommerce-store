import React, { useState } from 'react';
import './CustomerOrderList.css';
import { Package, RefreshCw, ChevronRight, ShoppingBag, Clock } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import AuthorizeNetPaymentModal from '../cart/AuthorizeNetPaymentModal';
import * as ordersApi from '../../services/ordersApi';
import { formatCurrency } from '../../utils/currencyUtils';

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PENDING', 'APPROVED', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'ARRIVED'];

// Stepper definitions per delivery method
const DELIVERY_STEPS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Preparing' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'DELIVERED', label: 'Delivered' }
];

const PICKUP_STEPS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Preparing' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
  { key: 'ARRIVED', label: 'Arrived' },
  { key: 'PICKED_UP', label: 'Picked Up' }
];

// Map each status to its stepper index
const DELIVERY_STATUS_INDEX = {
  PENDING: 0,
  APPROVED: 1,
  READY_FOR_DELIVERY: 2,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3
};

const PICKUP_STATUS_INDEX = {
  PENDING: 0,
  APPROVED: 1,
  READY_FOR_PICKUP: 2,
  ARRIVED: 3,
  PICKED_UP: 4
};

function StatusStepper({ status, isPickup }) {
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
  const indexMap = isPickup ? PICKUP_STATUS_INDEX : DELIVERY_STATUS_INDEX;
  const activeIndex = indexMap[status] ?? 0;

  return (
    <div className="order-status-stepper">
      {steps.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={step.key}>
            <div className={`stepper-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
              <div className="stepper-dot">
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="stepper-label">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`stepper-line ${i < activeIndex ? 'done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function getItemsSummary(order, products) {
  if (!order.items || order.items.length === 0) return 'No items';
  const active = order.items.filter((i) => !i.voided);
  if (active.length === 0) return 'No items';

  const MAX_SHOWN = 3;
  const shown = active.slice(0, MAX_SHOWN);
  const rest = active.length - MAX_SHOWN;

  const names = shown.map((item) => {
    const name = item.productName ?? 'Unknown';
    return item.quantity !== 1 ? `${name} ×${item.quantity}` : name;
  });

  return rest > 0 ? `${names.join(', ')} and ${rest} more` : names.join(', ');
}

function CustomerOrderList({ orders, isLoadingOrders, loadOrders, onSelectOrder, products, formatOrderDate }) {
  const navigate = useNavigate();
  const { notifyArrival } = useApp();
  const [activeTab, setActiveTab] = useState('active');
  const [arrivingOrderId, setArrivingOrderId] = useState(null);
  const [pendingPaymentModal, setPendingPaymentModal] = useState(null); // { orderId, iframeUrl, amount }
  const [cancellingOrderId, setCancellingOrderId] = useState(null);

  const handleArriveClick = async (orderId) => {
    setArrivingOrderId(orderId);
    try {
      await notifyArrival(orderId, 'Arrived');
    } catch {
      // Notification is handled globally by AppContext/apiClient
    } finally {
      setArrivingOrderId(null);
    }
  };

  const handleCompletePayment = async (order) => {
    try {
      const { token, iframeUrl } = await ordersApi.getPaymentToken(order.id);
      setPendingPaymentModal({ orderId: order.id, iframeUrl: iframeUrl || `https://test.authorize.net/payment/payment?token=${token}`, amount: order.total });
    } catch {
      // Error notification handled globally
    }
  };

  const handleCancelPendingOrder = async (orderId) => {
    setCancellingOrderId(orderId);
    try {
      await ordersApi.deleteOrder(orderId);
      loadOrders();
    } catch {
      // Error notification handled globally
    } finally {
      setCancellingOrderId(null);
    }
  };

  const myOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const activeOrders = myOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const displayedOrders = activeTab === 'active' ? activeOrders : myOrders;

  return (
    <>
    <div className="customer-orders-page">
      <div className="orders-header section-header-surface">
        <div>
          <h2 className="page-title">My Orders</h2>
          <p className="page-subtitle">
            {displayedOrders.length} {displayedOrders.length === 1 ? 'order' : 'orders'} shown
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadOrders()}
          className="btn-refresh-orders"
          title="Refresh"
          disabled={isLoadingOrders}
        >
          <RefreshCw size={18} className={isLoadingOrders ? 'spinning' : ''} />
          <span>Refresh</span>
        </button>
      </div>
      <HeaderDivider />

      <div className="customer-orders-tabs">
        <button
          type="button"
          className={`customer-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active
          {activeOrders.length > 0 && (
            <span className="customer-tab-badge">{activeOrders.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`customer-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Orders
        </button>
      </div>

      {isLoadingOrders ? (
        <div className="customer-orders-empty">
          <Package size={56} className="empty-icon" />
          <p>Loading your orders...</p>
        </div>
      ) : displayedOrders.length === 0 ? (
        <div className="customer-orders-empty">
          <ShoppingBag size={56} className="empty-icon" />
          <p>{activeTab === 'active' ? "You have no active orders right now." : "You haven't placed any orders yet."}</p>
          <button
            type="button"
            className="btn-browse-menu"
            onClick={() => navigate('/menu')}
          >
            Browse the menu
          </button>
        </div>
      ) : (
        <div className="customer-orders-list">
          {displayedOrders.map((order) => {
            const isPickup = order.deliveryMethod === 'PICKUP' || order.deliveryMethod === 'CURBSIDE';
            const isRejected = order.status === 'NOT_FULFILLING';
            const isPendingPayment = order.status === 'PENDING_PAYMENT';
            const itemCount = order.items?.filter((i) => !i.voided).length ?? 0;
            const itemsSummary = getItemsSummary(order, products);

            return (
              <div key={order.id} className="customer-order-card surface-card">
                <div className="order-card-header">
                  <div className="order-card-id-date">
                    <span className="order-card-id">Order #{order.id}</span>
                    <span className="order-card-date">{formatOrderDate(order.createdAt)}</span>
                  </div>
                  <span className={`order-method-badge ${order.deliveryMethod === 'CURBSIDE' ? 'method-pickup' : isPickup ? 'method-pickup' : 'method-delivery'}`}>
                    {order.deliveryMethod === 'CURBSIDE' ? 'Curbside Pickup' : isPickup ? 'Pickup' : 'Delivery'}
                  </span>
                </div>

                {isRejected ? (
                  <div className="order-rejected-banner">
                    Order could not be fulfilled — invalid payment
                  </div>
                ) : isPendingPayment ? (
                  <div className="order-pending-payment-banner">
                    <Clock size={16} className="banner-icon" />
                    <span>Awaiting payment — your order is reserved but not yet confirmed.</span>
                  </div>
                ) : (
                  <StatusStepper status={order.status} isPickup={isPickup} />
                )}

                {!isRejected && order.deliveryMethod === 'CURBSIDE' && order.status === 'ARRIVED' && (
                  <div className="order-arrived-banner">
                    <Clock size={16} className="banner-icon" />
                    <span>Check-in confirmed! Staff is bringing your order out now.</span>
                  </div>
                )}

                <p className="order-items-summary">{itemsSummary}</p>

                {isPendingPayment && (
                  <div className="customer-order-actions">
                    <button
                      type="button"
                      className="btn-complete-payment"
                      onClick={() => handleCompletePayment(order)}
                    >
                      Complete Payment
                    </button>
                    <button
                      type="button"
                      className="btn-cancel-order"
                      onClick={() => handleCancelPendingOrder(order.id)}
                      disabled={cancellingOrderId === order.id}
                    >
                      {cancellingOrderId === order.id ? 'Cancelling…' : 'Cancel Order'}
                    </button>
                  </div>
                )}

                {!isRejected && order.deliveryMethod === 'CURBSIDE' && order.status === 'READY_FOR_PICKUP' && (
                  <div className="customer-order-actions">
                    <button
                      type="button"
                      className="btn-arrive-here"
                      onClick={() => handleArriveClick(order.id)}
                      disabled={arrivingOrderId === order.id}
                    >
                      {arrivingOrderId === order.id ? 'Checking in...' : "I'm Here"}
                    </button>
                  </div>
                )}

                <div className="order-card-footer">
                  <span className="order-card-total">
                    ${formatCurrency(order.total)} &middot; {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <button
                    type="button"
                    className="btn-view-order"
                    onClick={() => onSelectOrder(order.id)}
                  >
                    View details <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

      {pendingPaymentModal && (
        <AuthorizeNetPaymentModal
          orderId={pendingPaymentModal.orderId}
          iframeUrl={pendingPaymentModal.iframeUrl}
          amount={pendingPaymentModal.amount}
          onSuccess={() => {
            setPendingPaymentModal(null);
            loadOrders();
          }}
          onFailure={() => setPendingPaymentModal(null)}
          onClose={() => setPendingPaymentModal(null)}
        />
      )}
    </>
  );
}

export default CustomerOrderList;
