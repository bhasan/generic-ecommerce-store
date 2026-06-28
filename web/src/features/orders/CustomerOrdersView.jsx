import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import CustomerOrderList from './CustomerOrderList';
import OrderDetailPanel from './OrderDetailPanel';
import {
  formatOrderDate,
  getProductName,
  getStatusClass,
  getStatusIcon,
  getStatusLabel,
} from './orderViewUtils';

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
          getStatusLabel={getStatusLabel}
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
