import React, { useState } from 'react';
import {
  X,
  Check,
  Trash2,
  Package,
  Clock,
  Truck,
  CheckCircle,
  RefreshCw,
  XCircle,
  PackageCheck,
  TruckIcon,
  CheckCheck,
  Plus,
  Minus,
  Edit,
  Save,
  HelpCircle,
  User,
  CreditCard,
  Phone,
  MapPin,
  Printer
} from 'lucide-react';
import './OrderDetailPanel.css';
import { OrderStatus } from '../../constants/orderStatuses';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencyUtils';

const STATUSES = Object.values(OrderStatus);

function OrderDetailPanel({
  order,
  onClose,
  canDeleteOrder = false,
  products,
  canModifyOrders,
  isEditing,
  onToggleEdit,
  onSaveEdit,
  onCancelEdit,
  addingItemToOrderId,
  newItemVariantId,
  setNewItemVariantId,
  newItemQuantity,
  setNewItemQuantity,
  onAddItem,
  onCancelAddItem,
  onStartAddItem,
  editingStatusId,
  onStartEditStatus,
  onStatusChange,
  onCancelStatusEdit,
  updateOrderStatus,
  onQuickAction,
  onVoidItem,
  onDeleteItem,
  onDeleteOrder,
  onPrintReceipt,
  showConfirmDialog,
  getStatusIcon,
  getStatusClass,
  getStatusLabel,
  formatOrderDate,
  getNextStatusActions,
  navigate,
  updatingOrderId
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

  if (!order) return null;



  const nextActions = canModifyOrders ? getNextStatusActions(order) : [];
  const canEdit = canModifyOrders && order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.PICKED_UP;
  const isAddingItem = addingItemToOrderId === order.id;
  const deliveryAddress = order.deliveryAddress || order.user?.address;
  const deliveryCheckSummary = [
    order.deliveryDistanceMiles !== null && order.deliveryDistanceMiles !== undefined
      ? `${order.deliveryDistanceMiles.toFixed(2)} miles`
      : null,
    order.deliverySource === 'ZIP_FALLBACK'
      ? 'ZIP fallback'
      : null,
  ].filter(Boolean).join(' | ');

  return (
    <>
      <div className="order-detail-panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="order-detail-panel">
        <div className="order-detail-panel-header">
          <h3 className="order-detail-panel-title">Order #{order.id}</h3>
          <button
            type="button"
            className="order-detail-panel-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={20} />
          </button>
        </div>

        <div className="order-detail-panel-body">
          <div className="order-detail-meta">
            <span className="order-detail-date">{formatOrderDate(order.createdAt)}</span>
            <span className={`order-detail-method-badge ${order.deliveryMethod === 'DELIVERY' ? 'method-delivery' : 'method-pickup'}`}>
              {order.deliveryMethod === 'CURBSIDE' ? 'Curbside Pickup' : order.deliveryMethod === 'PICKUP' ? 'Pickup' : 'Delivery'}
            </span>
            <span className="order-detail-total">${formatCurrency(order.total)}</span>
          </div>

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
                    <option key={s} value={s}>{getStatusLabel ? getStatusLabel(s) : s.replace(/_/g, ' ')}</option>
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

          {order.user && (
            <div className="order-detail-customer">
              <h4 className="order-detail-block-title">
                <User size={16} />
                {canModifyOrders ? 'Customer' : 'Fulfillment Details'}
              </h4>
              <div className="order-customer-info">
                {canModifyOrders && (
                  <>
                    <div className="customer-info-row">
                      <span className="customer-info-label">Username:</span>
                      <span className="customer-info-value">{order.user.username || 'N/A'}</span>
                    </div>
                    <div className="customer-info-row">
                      <CreditCard size={14} className="customer-info-icon" />
                      <span className="customer-info-label">Payment:</span>
                      <span className={`customer-info-value ${
                        order.paymentMethod === 'IN_STORE' 
                          ? 'payment-store' 
                          : (order.paymentMethod === 'EXTERNAL' && order.status === 'PENDING')
                            ? 'payment-verify'
                            : (order.paymentMethod === 'STORE_CREDIT' || order.paymentMethod === 'EXTERNAL')
                              ? 'payment-paid'
                              : 'payment-none'
                      }`}>
                        {order.paymentMethod === 'IN_STORE' ? 'Pay In Store' :
                         (order.paymentMethod === 'EXTERNAL' && order.status === 'PENDING') ? 'Verify External Payment' :
                         (order.paymentMethod === 'EXTERNAL' ? 'External Payment (Paid)' : 
                          order.paymentMethod === 'STORE_CREDIT' ? 'Store Credit (Paid)' : 'No payment method')}
                      </span>
                    </div>
                    {order.user.phoneNumber && (
                      <div className="customer-info-row">
                        <Phone size={14} className="customer-info-icon" />
                        <span className="customer-info-label">Phone:</span>
                        <span className="customer-info-value">{order.user.phoneNumber}</span>
                      </div>
                    )}
                  </>
                )}
                {order.deliveryMethod === 'CURBSIDE' ? (
                  <div className="customer-info-row">
                    <MapPin size={14} className="customer-info-icon" />
                    <span className="customer-info-label">Vehicle Info:</span>
                    <span className="customer-info-value">
                      {order.vehicleDescription || order.deliveryAddress?.replace(/^CURBSIDE(:\s*|\s*\|\s*|$)/i, '') || 'CURBSIDE'}
                    </span>
                  </div>
                ) : (
                  order.deliveryMethod === 'DELIVERY' && deliveryAddress && (
                    <div className="customer-info-row">
                      <MapPin size={14} className="customer-info-icon" />
                      <span className="customer-info-label">Address:</span>
                      <span className="customer-info-value">{deliveryAddress}</span>
                    </div>
                  )
                )}
                {deliveryCheckSummary && canModifyOrders && (
                  <div className="customer-info-row">
                    <MapPin size={14} className="customer-info-icon" />
                    <span className="customer-info-label">Delivery check:</span>
                    <span className="customer-info-value">{deliveryCheckSummary}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="order-detail-items">
            <h4 className="order-detail-block-title">Items</h4>
            <div className="order-items-list">
              {order.items?.map((item, idx) => {
                const itemId = item.id ?? idx;
                return (
                  <div
                    key={itemId}
                    className={`order-item ${item.voided ? 'order-item-voided' : ''} ${item.addedAfterSubmission ? 'order-item-added' : ''}`}
                  >
                    <div className="order-item-info">
                      <span className="order-item-name">
                        {item.productName ?? 'Unknown Product'}
                        {item.variantLabel && item.variantLabel !== 'Default' && (
                          <span className="order-item-variant"> — {item.variantLabel}</span>
                        )}
                        {item.voided && <span className="order-item-badge badge-voided">Voided</span>}
                        {item.addedAfterSubmission && <span className="order-item-badge badge-added">Added</span>}
                      </span>
                      <span className="order-item-quantity">× {item.quantity}</span>
                    </div>
                    <div className="order-item-right">
                      <span className="order-item-price">
                        ${formatCurrency(Number(item.unitPrice ?? item.price ?? 0) * item.quantity)}
                      </span>
                      {isEditing && !item.voided && (
                        <div className="order-item-actions">
                          <button
                            type="button"
                            onClick={() => onVoidItem(order.id, itemId, item.productName ?? 'item')}
                            className="btn-item-action btn-item-void"
                            title="Void"
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(order.id, itemId, item.productName ?? 'item')}
                            className="btn-item-action btn-item-delete"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isEditing && (
              <div className="add-item-section">
                {isAddingItem ? (
                  <div className="add-item-form">
                    <div className="add-item-field">
                      <label>Product</label>
                      <select
                        value={newItemVariantId}
                        onChange={(e) => setNewItemVariantId(e.target.value)}
                      >
                        <option value="">Select a product</option>
                        {products.flatMap((p) =>
                          (p.variants ?? []).filter(v => v.active).map(v => (
                            <option key={v.id} value={v.id}>
                              {p.name}{v.label !== 'Default' ? ` — ${v.label}` : ''} — ${formatCurrency(Number(v.basePrice))}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="add-item-field add-item-field-qty">
                      <label>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemQuantity}
                        onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddItem(order.id)}
                      className="btn-add-item"
                      disabled={!newItemVariantId}
                    >
                      <Plus size={16} />
                      Add
                    </button>
                    <button type="button" onClick={onCancelAddItem} className="btn-cancel-status">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onStartAddItem(order.id)} className="btn-toggle-add-item">
                    <Plus size={16} />
                    Add Item
                  </button>
                )}
              </div>
            )}
          </div>

          {order.statusEvents?.length > 0 && (
            <div className="order-detail-status-timeline">
              <h4 className="order-detail-block-title">Status Timeline</h4>
              <div className="status-timeline-list">
                {order.statusEvents.map((event) => (
                  <div key={event.id} className="status-timeline-event">
                    <div className="status-timeline-transition">
                      {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}
                    </div>
                    <div className="status-timeline-meta">
                      <span className="status-timeline-date">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                      <span className="status-timeline-by">
                        {event.changedBy ? `User #${event.changedBy}` : 'System'}
                      </span>
                    </div>
                    {event.note && (
                      <div className="status-timeline-note">{event.note}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.payments?.length > 0 && (
            <div className="order-detail-payments">
              <h4 className="order-detail-block-title">Payment Records</h4>
              <div className="payment-records-list">
                {order.payments.map((payment) => (
                  <div key={payment.id} className="payment-record-row">
                    <div className="customer-info-row">
                      <span className="customer-info-label">Method:</span>
                      <span className="customer-info-value">{payment.method}</span>
                    </div>
                    <div className="customer-info-row">
                      <span className="customer-info-label">Status:</span>
                      <span className="customer-info-value">{payment.status}</span>
                    </div>
                    <div className="customer-info-row">
                      <span className="customer-info-label">Amount:</span>
                      <span className="customer-info-value">${formatCurrency(Number(payment.amount))}</span>
                    </div>
                    {payment.transactionId && (
                      <div className="customer-info-row">
                        <span className="customer-info-label">Transaction ID:</span>
                        <span className="customer-info-value">{payment.transactionId}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="order-detail-actions">
            <button
              type="button"
              onClick={() => navigate(`/help?orderId=${order.id}`)}
              className="btn-order-help"
            >
              <HelpCircle size={16} />
              Need Help?
            </button>

            {canModifyOrders && (
              <button
                type="button"
                onClick={() => onPrintReceipt(order.id)}
                className="btn-order-help btn-order-print"
              >
                <Printer size={16} />
                Print Receipt
              </button>
            )}

            {canEdit && (
              <div className="order-edit-section">
                {isEditing ? (
                  <div className="edit-actions">
                    <button type="button" onClick={onSaveEdit} className="btn-save-edit">
                      <Save size={16} />
                      Save
                    </button>
                    <button type="button" onClick={onCancelEdit} className="btn-cancel-edit">
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onToggleEdit(order.id)} className="btn-edit-order">
                    <Edit size={16} />
                    Edit Order
                  </button>
                )}
              </div>
            )}

            {isEditing && canModifyOrders && canDeleteOrder && (
              <button
                type="button"
                onClick={() =>
                  showConfirmDialog(
                    'Delete Order',
                    'Are you sure you want to permanently delete this order?',
                    () => {
                      onDeleteOrder(order.id);
                      onClose();
                    }
                  )
                }
                className="btn-order-action btn-delete-order"
              >
                <Trash2 size={16} />
                Delete Order
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default OrderDetailPanel;
