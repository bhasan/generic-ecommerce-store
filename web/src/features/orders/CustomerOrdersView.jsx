import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import CustomerOrderList from './CustomerOrderList';
import OrderDetailPanel from './OrderDetailPanel';
import { OrderStatus } from '../../constants/orderStatuses';
import {
  Clock,
  Check,
  XCircle,
  Package,
  Truck,
  CheckCircle
} from 'lucide-react';

const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Prep Order',
  NOT_FULFILLING: 'Reject Order (Invalid Payment)',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  OUT_FOR_DELIVERY: 'In Delivery',
  DELIVERED: 'Delivered',
  READY_FOR_PICKUP: 'Ready for Pickup',
  ARRIVED: 'Customer Arrived',
  PICKED_UP: 'Picked Up'
};

const formatOrderDate = (dateString) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? dateString : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const getProductName = (item) => item?.productName ?? 'Unknown Product';

const getStatusIcon = (status) => {
  switch (status) {
    case 'PENDING': return <Clock size={18} />;
    case 'APPROVED': return <Check size={18} />;
    case 'NOT_FULFILLING': return <XCircle size={18} />;
    case 'READY_FOR_DELIVERY': return <Package size={18} />;
    case 'READY_FOR_PICKUP': return <Package size={18} />;
    case 'ARRIVED': return <Package size={18} />;
    case 'OUT_FOR_DELIVERY': return <Truck size={18} />;
    case 'DELIVERED': return <CheckCircle size={18} />;
    case 'PICKED_UP': return <CheckCircle size={18} />;
    default: return <Clock size={18} />;
  }
};

const getStatusClass = (status) => {
  const map = {
    PENDING: 'status-pending',
    APPROVED: 'status-approved',
    NOT_FULFILLING: 'status-not-fulfilling',
    READY_FOR_DELIVERY: 'status-ready',
    READY_FOR_PICKUP: 'status-ready',
    ARRIVED: 'status-arrived',
    OUT_FOR_DELIVERY: 'status-out-for-delivery',
    DELIVERED: 'status-delivered',
    PICKED_UP: 'status-picked-up'
  };
  return map[status] || 'status-pending';
};

export default function CustomerOrdersView() {
  const navigate = useNavigate();
  const {
    currentUser,
    orders,
    products,
    isLoadingOrders,
    loadOrders,
    updateOrderStatus
  } = useApp();

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const myOrders = orders.filter((o) => o.userId === currentUser.id);
  const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : null;

  const handleConfirm = () => {
    if (confirmDialog?.onConfirm) confirmDialog.onConfirm();
    setConfirmDialog(null);
  };

  return (
    <>
      <CustomerOrderList
        orders={myOrders}
        isLoadingOrders={isLoadingOrders}
        loadOrders={loadOrders}
        onSelectOrder={setSelectedOrderId}
        products={products}
        formatOrderDate={formatOrderDate}
      />
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
          products={products}
          canModifyOrders={false}
          canDeleteOrder={false}
          isEditing={false}
          onToggleEdit={() => {}}
          onSaveEdit={() => {}}
          onCancelEdit={() => {}}
          addingItemToOrderId={null}
          newItemVariantId=""
          setNewItemVariantId={() => {}}
          newItemQuantity={1}
          setNewItemQuantity={() => {}}
          onAddItem={() => {}}
          onCancelAddItem={() => {}}
          onStartAddItem={() => {}}
          editingStatusId={null}
          onStartEditStatus={() => {}}
          onStatusChange={() => {}}
          onCancelStatusEdit={() => {}}
          updateOrderStatus={updateOrderStatus}
          onQuickAction={() => {}}
          onVoidItem={() => {}}
          onDeleteItem={() => {}}
          onDeleteOrder={() => {}}
          showConfirmDialog={(title, message, onConfirm) => setConfirmDialog({ title, message, onConfirm })}
          getProductName={getProductName}
          getStatusIcon={getStatusIcon}
          getStatusClass={getStatusClass}
          getStatusLabel={(s) => STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}
          formatOrderDate={formatOrderDate}
          getNextStatusActions={() => []}
          navigate={navigate}
          updatingOrderId={null}
        />
      )}
      {confirmDialog && (
        <div className="confirmation-dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirmation-dialog surface-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirmation-dialog-title">{confirmDialog.title}</h3>
            <p className="confirmation-dialog-message">{confirmDialog.message}</p>
            <div className="confirmation-dialog-actions">
              <button type="button" className="btn-dialog btn-dialog-cancel" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn-dialog btn-dialog-confirm ${confirmDialog.confirmVariant ? 'variant-' + confirmDialog.confirmVariant : ''}`}
                onClick={handleConfirm}
              >
                {confirmDialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
