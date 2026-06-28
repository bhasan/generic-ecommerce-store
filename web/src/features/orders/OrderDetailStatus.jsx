import React, { useState } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import { OrderStatus } from '../../constants/orderStatuses';
import { useApp } from '../../context/AppContext';

const STATUSES = Object.values(OrderStatus);

export default function OrderDetailStatus({
  order,
  editingStatusId,
  canModifyOrders,
  updatingOrderId,
  getStatusLabel,
  getStatusClass,
  getStatusIcon,
  onStatusChange,
  onCancelStatusEdit,
  onStartEditStatus,
  onQuickAction,
  nextActions
}) {
  const { notifyArrival } = useApp();
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const handleArriveClick = async () => {
    setIsCheckingIn(true);
    try {
      await notifyArrival(order.id, 'Arrived');
    } catch {
      // Handled globally
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="order-detail-status-block">
      <h4 className="order-detail-block-title">Status</h4>
      {editingStatusId === order.id && canModifyOrders ? (
        <div className="status-selector">
          <select
            value={order.status}
            onChange={(e) => onStatusChange(order.id, e.target.value)}
            className="status-select"
            disabled={updatingOrderId === order.id}
            aria-label="Change order status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {getStatusLabel ? getStatusLabel(s) : s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <button type="button" onClick={onCancelStatusEdit} className="btn-cancel-status">
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="order-status-container">
            <div className={`order-status ${getStatusClass(order.status)}`}>
              {getStatusIcon(order.status)}
              <span>{getStatusLabel ? getStatusLabel(order.status) : order.status.replace(/_/g, ' ')}</span>
            </div>
            {canModifyOrders && (
              <button
                type="button"
                onClick={() => onStartEditStatus(order.id)}
                className="btn-change-status"
                title="Change status"
                disabled={updatingOrderId === order.id}
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
          {nextActions.length > 0 && (
            <div className="order-quick-actions">
              <span className="order-quick-actions-label">Move Order Status To:</span>
              {nextActions.map((action) => (
                <button
                  key={action.status}
                  onClick={() => onQuickAction(order.id, action.status)}
                  className={`btn-quick-action ${action.className}`}
                  disabled={updatingOrderId === order.id}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
          {!canModifyOrders && order.deliveryMethod === 'CURBSIDE' && order.status === 'READY_FOR_PICKUP' && (
            <div className="customer-order-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-arrive-here"
                onClick={handleArriveClick}
                disabled={isCheckingIn}
                style={{ width: '100%' }}
              >
                {isCheckingIn ? 'Checking in...' : "I'm Here"}
              </button>
            </div>
          )}
          {!canModifyOrders && order.deliveryMethod === 'CURBSIDE' && order.status === 'ARRIVED' && (
            <div className="order-arrived-banner" style={{ marginTop: '1rem' }}>
              <Clock size={16} className="banner-icon" />
              <span>Check-in confirmed! Staff is bringing your order out now.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
