import React from 'react';
import {
  X,
  Trash2,
  Edit,
  Save,
  HelpCircle,
  Printer
} from 'lucide-react';
import './OrderDetailPanel.css';
import { OrderStatus } from '../../constants/orderStatuses';
import { formatPrice } from '../../utils/currencyUtils';

import OrderDetailHeader from './OrderDetailHeader';
import OrderDetailStatus from './OrderDetailStatus';
import OrderDetailCustomer from './OrderDetailCustomer';
import OrderDetailItems from './OrderDetailItems';

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
          <OrderDetailHeader order={order} formatOrderDate={formatOrderDate} />

          <OrderDetailStatus
            order={order}
            editingStatusId={editingStatusId}
            canModifyOrders={canModifyOrders}
            updatingOrderId={updatingOrderId}
            getStatusLabel={getStatusLabel}
            getStatusClass={getStatusClass}
            getStatusIcon={getStatusIcon}
            onStatusChange={onStatusChange}
            onCancelStatusEdit={onCancelStatusEdit}
            onStartEditStatus={onStartEditStatus}
            onQuickAction={onQuickAction}
            nextActions={nextActions}
          />

          <OrderDetailCustomer
            order={order}
            canModifyOrders={canModifyOrders}
            deliveryAddress={deliveryAddress}
            deliveryCheckSummary={deliveryCheckSummary}
          />

          <OrderDetailItems
            order={order}
            isEditing={isEditing}
            isAddingItem={isAddingItem}
            products={products}
            newItemVariantId={newItemVariantId}
            setNewItemVariantId={setNewItemVariantId}
            newItemQuantity={newItemQuantity}
            setNewItemQuantity={setNewItemQuantity}
            onAddItem={onAddItem}
            onCancelAddItem={onCancelAddItem}
            onStartAddItem={onStartAddItem}
            onVoidItem={onVoidItem}
            onDeleteItem={onDeleteItem}
          />

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
                      <span className="customer-info-value">{formatPrice(Number(payment.amount))}</span>
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
