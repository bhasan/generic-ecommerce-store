import React, { useState, useEffect } from 'react';
import './OrdersPage.css';
import { useApp } from '../../context/AppContext';
import { Check, Trash2, Package, Clock, Truck, CheckCircle, RefreshCw, XCircle, PackageCheck, TruckIcon, CheckCheck, Plus, X, Minus, Edit, Save } from 'lucide-react';

function OrdersPage() {
  const { 
    currentUser, 
    orders, 
    products, 
    isLoadingOrders,
    loadOrders,
    updateOrderStatus, 
    deleteOrder,
    addItemToOrder,
    voidOrderItem,
    deleteOrderItem,
    restoreOrder
  } = useApp();
  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [originalOrderState, setOriginalOrderState] = useState(null);
  const [addingItemToOrderId, setAddingItemToOrderId] = useState(null);
  const [newItemProductId, setNewItemProductId] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState(null);
  
  // Refresh orders on page load and when page comes into focus
  useEffect(() => {
    // Refresh on initial load
    loadOrders();

    // Refresh when page comes into focus (e.g., after marking as delivered on Delivery page)
    const handleFocus = () => {
      loadOrders();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrders]);
  
  // Helper to check if user has a role (supports both old and new format)
  const hasRole = (role) => {
    const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
    return userRoles.includes(role);
  };
  
  // Customers see only their orders, admins/managers see all
  const isCustomerOnly = hasRole('CUSTOMER') && !hasRole('MANAGEMENT') && !hasRole('ADMIN');
  const userOrders = isCustomerOnly
    ? orders.filter(o => o.userId === currentUser.id)
    : orders;
  
  // Only admins and managers can modify orders
  const canModifyOrders = hasRole('MANAGEMENT') || hasRole('ADMIN');
  
  const statuses = ['PENDING', 'APPROVED', 'NOT_FULFILLING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown Product';
  };

  const getProductPrice = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.price : 0;
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'PENDING':
        return <Clock size={18} />;
      case 'APPROVED':
        return <Check size={18} />;
      case 'NOT_FULFILLING':
        return <XCircle size={18} />;
      case 'READY_FOR_DELIVERY':
        return <Package size={18} />;
      case 'OUT_FOR_DELIVERY':
        return <Truck size={18} />;
      case 'DELIVERED':
        return <CheckCircle size={18} />;
      default:
        return <Clock size={18} />;
    }
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'PENDING':
        return 'status-pending';
      case 'APPROVED':
        return 'status-approved';
      case 'NOT_FULFILLING':
        return 'status-not-fulfilling';
      case 'READY_FOR_DELIVERY':
        return 'status-ready';
      case 'OUT_FOR_DELIVERY':
        return 'status-out-for-delivery';
      case 'DELIVERED':
        return 'status-delivered';
      default:
        return 'status-pending';
    }
  };

  const handleStatusChange = (orderId, newStatus) => {
    updateOrderStatus(orderId, newStatus);
    setEditingStatusId(null);
  };

  const handleQuickAction = (orderId, newStatus) => {
    updateOrderStatus(orderId, newStatus);
  };

  const getNextStatusActions = (currentStatus) => {
    switch(currentStatus) {
      case 'PENDING':
        return [
          { status: 'APPROVED', label: 'Approve', icon: <Check size={16} />, className: 'btn-quick-action-approve' },
          { status: 'NOT_FULFILLING', label: 'Not Fulfilling', icon: <XCircle size={16} />, className: 'btn-quick-action-reject' }
        ];
      case 'APPROVED':
        return [
          { status: 'READY_FOR_DELIVERY', label: 'Ready for Delivery', icon: <PackageCheck size={16} />, className: 'btn-quick-action-ready' }
        ];
      case 'READY_FOR_DELIVERY':
        return [
          { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: <TruckIcon size={16} />, className: 'btn-quick-action-deliver' }
        ];
      case 'OUT_FOR_DELIVERY':
        return [
          { status: 'DELIVERED', label: 'Mark Delivered', icon: <CheckCheck size={16} />, className: 'btn-quick-action-complete' }
        ];
      default:
        return [];
    }
  };

  const handleAddItem = (orderId) => {
    if (!newItemProductId) return;
    
    const product = products.find(p => p.id === parseInt(newItemProductId));
    if (!product) return;

    const newItem = {
      productId: product.id,
      quantity: newItemQuantity,
      price: product.price
    };

    addItemToOrder(orderId, newItem);
    setAddingItemToOrderId(null);
    setNewItemProductId('');
    setNewItemQuantity(1);
  };

  const showConfirmDialog = (title, message, onConfirm) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  const handleConfirm = () => {
    if (confirmDialog?.onConfirm) {
      confirmDialog.onConfirm();
    }
    setConfirmDialog(null);
  };

  const handleVoidItem = (orderId, itemIndex, itemName) => {
    showConfirmDialog(
      'Void Item',
      `Are you sure you want to void "${itemName}"? This will strike through the item and exclude it from the order total.`,
      () => voidOrderItem(orderId, itemIndex)
    );
  };

  const handleDeleteItem = (orderId, itemIndex, itemName) => {
    showConfirmDialog(
      'Delete Item',
      `Are you sure you want to permanently delete "${itemName}" from this order?`,
      () => {
        deleteOrderItem(orderId, itemIndex);
        // If order has no items left after deletion, exit edit mode
        const order = orders.find(o => o.id === orderId);
        if (order && order.items.length === 1) {
          setEditingOrderId(null);
        }
      }
    );
  };

  const toggleEditOrder = (orderId) => {
    if (editingOrderId === orderId) {
      // Cancel edit mode - don't do anything, user should click Cancel button
      return;
    } else {
      // Enter edit mode - save original state
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setOriginalOrderState(JSON.parse(JSON.stringify(order))); // Deep copy
        setEditingOrderId(orderId);
      }
    }
  };

  const handleSaveOrder = () => {
    // Simply exit edit mode - changes are already applied
    setEditingOrderId(null);
    setOriginalOrderState(null);
    setAddingItemToOrderId(null);
    setNewItemProductId('');
    setNewItemQuantity(1);
  };

  const handleCancelOrder = () => {
    // Restore original order state
    if (originalOrderState && restoreOrder) {
      restoreOrder(originalOrderState);
    }
    // Exit edit mode
    setEditingOrderId(null);
    setOriginalOrderState(null);
    setAddingItemToOrderId(null);
    setNewItemProductId('');
    setNewItemQuantity(1);
  };

  return (
    <div className="orders-page-container">
      <div className="orders-header section-header-surface">
        <div>
          <h2 className="page-title">
            {isCustomerOnly ? 'My Orders' : 'All Orders'}
          </h2>
          <p className="page-subtitle">
            {userOrders.length} {userOrders.length === 1 ? 'order' : 'orders'} found
          </p>
        </div>
        <button
          onClick={() => loadOrders()}
          className="btn-refresh-orders"
          title="Refresh orders"
          disabled={isLoadingOrders}
        >
          <RefreshCw size={18} className={isLoadingOrders ? 'spinning' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="orders-list">
        {isLoadingOrders ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>Loading orders...</p>
          </div>
        ) : userOrders.length === 0 ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>No orders found.</p>
          </div>
        ) : (
          userOrders.map(order => {
            const nextActions = canModifyOrders ? getNextStatusActions(order.status) : [];
            const isEditing = editingOrderId === order.id;
            const canEdit = canModifyOrders && order.status !== 'DELIVERED';
            
            return (
              <div key={order.id} className="order-card surface-card">
                <div className="order-header">
                  <div className="order-info">
                    <h3 className="order-id">Order #{order.id}</h3>
                    <div className="order-meta">
                      <span className="order-date">{order.createdAt}</span>
                      <span className="order-separator">•</span>
                      <span className="order-total">${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  {editingStatusId === order.id && canModifyOrders ? (
                    <div className="status-selector">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className="status-select"
                      >
                        {statuses.map(status => (
                          <option key={status} value={status}>
                            {status.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingStatusId(null)}
                        className="btn-cancel-status"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="order-status-container">
                      <div className={`order-status ${getStatusClass(order.status)}`}>
                        {getStatusIcon(order.status)}
                        <span>{order.status.replace(/_/g, ' ')}</span>
                      </div>
                      {canModifyOrders && (
                        <button
                          onClick={() => setEditingStatusId(order.id)}
                          className="btn-change-status"
                          title="Change status"
                        >
                          <RefreshCw size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick Action Buttons */}
                {nextActions.length > 0 && (
                  <div className="order-quick-actions">
                    {nextActions.map(action => (
                      <button
                        key={action.status}
                        onClick={() => handleQuickAction(order.id, action.status)}
                        className={`btn-quick-action ${action.className}`}
                      >
                        {action.icon}
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="order-items">
                  <h4 className="order-items-title">Order Items</h4>
                  <div className="order-items-list">
                    {order.items.map((item, idx) => {
                      const itemId = item.id || idx; // Use item.id from API if available, fallback to index
                      return (
                        <div 
                          key={itemId} 
                          className={`order-item ${item.voided ? 'order-item-voided' : ''} ${item.addedAfterSubmission ? 'order-item-added' : ''}`}
                        >
                          <div className="order-item-info">
                            <span className="order-item-name">
                              {getProductName(item.productId)}
                              {item.voided && (
                                <span className="order-item-badge badge-voided">Voided</span>
                              )}
                              {item.addedAfterSubmission && (
                                <span className="order-item-badge badge-added">Added</span>
                              )}
                            </span>
                            <span className="order-item-quantity">× {item.quantity}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span className="order-item-price">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                            {isEditing && !item.voided && (
                              <div className="order-item-actions">
                                <button
                                  onClick={() => handleVoidItem(order.id, itemId, getProductName(item.productId))}
                                  className="btn-item-action btn-item-void"
                                  title="Void item"
                                >
                                  <Minus size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(order.id, itemId, getProductName(item.productId))}
                                  className="btn-item-action btn-item-delete"
                                  title="Delete item"
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

                  {/* Add Item Section - Only show when editing */}
                  {isEditing && (
                    <div style={{ marginTop: '1rem' }}>
                      {addingItemToOrderId === order.id ? (
                        <div className="add-item-section">
                          <div className="add-item-form">
                            <div className="add-item-field">
                              <label>Product</label>
                              <select
                                value={newItemProductId}
                                onChange={(e) => setNewItemProductId(e.target.value)}
                              >
                                <option value="">Select a product</option>
                                {products.map(product => (
                                  <option key={product.id} value={product.id}>
                                    {product.name} - ${product.price.toFixed(2)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="add-item-field" style={{ maxWidth: '100px' }}>
                              <label>Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={newItemQuantity}
                                onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                              />
                            </div>
                            <button
                              onClick={() => handleAddItem(order.id)}
                              className="btn-add-item"
                              disabled={!newItemProductId}
                            >
                              <Plus size={16} />
                              Add Item
                            </button>
                            <button
                              onClick={() => {
                                setAddingItemToOrderId(null);
                                setNewItemProductId('');
                                setNewItemQuantity(1);
                              }}
                              className="btn-cancel-status"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingItemToOrderId(order.id)}
                          className="btn-toggle-add-item"
                        >
                          <Plus size={16} />
                          Add Item to Order
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Order Section - Moved to bottom */}
                {canEdit && (
                  <div className="order-edit-section">
                    {isEditing ? (
                      <div className="edit-actions">
                        <button
                          onClick={handleSaveOrder}
                          className="btn-save-edit"
                        >
                          <Save size={16} />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={handleCancelOrder}
                          className="btn-cancel-edit"
                        >
                          <X size={16} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleEditOrder(order.id)}
                        className="btn-edit-order"
                      >
                        <Edit size={16} />
                        <span>Edit Order</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Delete Order Button - Only show when editing and user is Admin */}
                {isEditing && hasRole('ADMIN') && (
                  <div className="order-actions">
                    <button
                      onClick={() => {
                        showConfirmDialog(
                          'Delete Order',
                          'Are you sure you want to permanently delete this entire order? This action cannot be undone.',
                          () => {
                            deleteOrder(order.id);
                            setEditingOrderId(null);
                          }
                        );
                      }}
                      className="btn-order-action btn-delete-order"
                    >
                      <Trash2 size={16} />
                      <span>Delete Order</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="confirmation-dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirmation-dialog surface-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirmation-dialog-title">{confirmDialog.title}</h3>
            <p className="confirmation-dialog-message">{confirmDialog.message}</p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setConfirmDialog(null)}
                className="btn-dialog btn-dialog-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="btn-dialog btn-dialog-confirm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersPage;