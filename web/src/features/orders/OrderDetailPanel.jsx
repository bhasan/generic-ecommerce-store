import React from 'react';
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
  newItemProductId,
  setNewItemProductId,
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
  getProductName,
  getStatusIcon,
  getStatusClass,
  getStatusLabel,
  formatOrderDate,
  getNextStatusActions,
  navigate,
  updatingOrderId
}) {
  if (!order) return null;

  const nextActions = canModifyOrders ? getNextStatusActions(order) : [];
  const canEdit = canModifyOrders && order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.PICKED_UP;
  const isAddingItem = addingItemToOrderId === order.id;
  const deliveryAddress = order.deliveryAddress || order.user?.address;
  const deliveryCheckSummary = [
    order.deliveryDistanceMiles !== null && order.deliveryDistanceMiles !== undefined
      ? `${order.deliveryDistanceMiles.toFixed(2)} miles`
      : null,
    order.deliveryEligibilitySource === 'ZIP_FALLBACK'
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
            <span className={`order-detail-method-badge ${order.deliveryMethod === 'PICKUP' ? 'method-pickup' : 'method-delivery'}`}>
              {order.deliveryMethod === 'PICKUP' ? 'Pickup' : 'Delivery'}
            </span>
            <span className="order-detail-total">${order.total.toFixed(2)}</span>
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
              </>
            )}
          </div>

          {canModifyOrders && order.user && (
            <div className="order-detail-customer">
              <h4 className="order-detail-block-title">
                <User size={16} />
                Customer
              </h4>
              <div className="order-customer-info">
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
                        : (order.paymentMethod === 'CREDIT' || order.paymentMethod === 'EXTERNAL')
                          ? 'payment-paid'
                          : 'payment-none'
                  }`}>
                    {order.paymentMethod === 'IN_STORE' ? 'Pay In Store' :
                     (order.paymentMethod === 'EXTERNAL' && order.status === 'PENDING') ? 'Verify External Payment' :
                     (order.paymentMethod === 'EXTERNAL' ? 'External Payment (Paid)' : 
                      order.paymentMethod === 'CREDIT' ? 'Store Credit (Paid)' : 'No payment method')}
                  </span>
                </div>
                {order.user.phoneNumber && (
                  <div className="customer-info-row">
                    <Phone size={14} className="customer-info-icon" />
                    <span className="customer-info-label">Phone:</span>
                    <span className="customer-info-value">{order.user.phoneNumber}</span>
                  </div>
                )}
                {deliveryAddress && (
                  <div className="customer-info-row">
                    <MapPin size={14} className="customer-info-icon" />
                    <span className="customer-info-label">Address:</span>
                    <span className="customer-info-value">{deliveryAddress}</span>
                  </div>
                )}
                {deliveryCheckSummary && (
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
                        {getProductName(item.productId)}
                        {item.voided && <span className="order-item-badge badge-voided">Voided</span>}
                        {item.addedAfterSubmission && <span className="order-item-badge badge-added">Added</span>}
                      </span>
                      <span className="order-item-quantity">× {item.quantity}</span>
                    </div>
                    <div className="order-item-right">
                      <span className="order-item-price">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                      {isEditing && !item.voided && (
                        <div className="order-item-actions">
                          <button
                            type="button"
                            onClick={() => onVoidItem(order.id, itemId, getProductName(item.productId))}
                            className="btn-item-action btn-item-void"
                            title="Void"
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(order.id, itemId, getProductName(item.productId))}
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
                        value={newItemProductId}
                        onChange={(e) => setNewItemProductId(e.target.value)}
                      >
                        <option value="">Select a product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} - ${p.price.toFixed(2)}</option>
                        ))}
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
                      disabled={!newItemProductId}
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
