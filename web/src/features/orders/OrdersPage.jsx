import React, { useState, useEffect, useRef } from 'react';
import './OrdersPage.css';
import { useApp } from '../../context/AppContext';
import { Check, Trash2, Package, Clock, Truck, CheckCircle, RefreshCw, XCircle, PackageCheck, TruckIcon, CheckCheck, Plus, X, Minus, Edit, Save, HelpCircle, User, CreditCard, Phone, MapPin, LayoutGrid, List, Filter, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HeaderDivider from '../../components/common/HeaderDivider';
import { hasRole } from '../../utils/roles';

// Closed order statuses (not shown by default)
const CLOSED_STATUSES = ['DELIVERED', 'NOT_FULFILLING'];

const ORDER_POLL_INTERVAL_MS = Number(import.meta.env.VITE_ORDER_POLL_INTERVAL_MS || 60000);

function OrdersPage() {
  const navigate = useNavigate();
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
  const [newOrderIds, setNewOrderIds] = useState([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const knownOrderIdsRef = useRef(new Set());
  const viewStartAtRef = useRef(Date.now());
  const hasInitializedOrdersRef = useRef(false);
  const ordersRef = useRef(orders);

  // Customers see only their orders, employees/admins/managers see all
  const isCustomerOnly = hasRole(currentUser, 'CUSTOMER')
    && !hasRole(currentUser, 'EMPLOYEE')
    && !hasRole(currentUser, 'MANAGEMENT')
    && !hasRole(currentUser, 'ADMIN');
  
  // Filter orders based on user role and show all toggle
  const filteredOrders = orders.filter(o => {
    // First apply user filter
    if (isCustomerOnly && o.userId !== currentUser.id) return false;
    // Then apply open/all filter (only for non-customers)
    if (!isCustomerOnly && !showAllOrders && CLOSED_STATUSES.includes(o.status)) return false;
    return true;
  });

  // Count open orders for display
  const openOrdersCount = orders.filter(o => {
    if (isCustomerOnly && o.userId !== currentUser.id) return false;
    return !CLOSED_STATUSES.includes(o.status);
  }).length;

  const totalOrdersCount = isCustomerOnly 
    ? orders.filter(o => o.userId === currentUser.id).length 
    : orders.length;

  // Employees, managers, and admins can modify orders
  const canModifyOrders = hasRole(currentUser, 'EMPLOYEE') || hasRole(currentUser, 'MANAGEMENT') || hasRole(currentUser, 'ADMIN');
  
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Refresh orders on page load and when page comes into focus
  useEffect(() => {
    // Refresh on initial load
    loadOrders();

    // Refresh when page comes into focus (e.g., after marking as delivered on Delivery page)
    const handleFocus = () => {
      viewStartAtRef.current = Date.now();
      setNewOrderIds([]);
      knownOrderIdsRef.current = new Set(ordersRef.current.map(order => order.id));
      loadOrders();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!canModifyOrders) return undefined;

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        loadOrders();
      }
    }, ORDER_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [loadOrders, canModifyOrders]);

  useEffect(() => {
    if (isLoadingOrders) return;

    if (!hasInitializedOrdersRef.current) {
      knownOrderIdsRef.current = new Set(orders.map(order => order.id));
      hasInitializedOrdersRef.current = true;
      return;
    }

    const viewStartAt = viewStartAtRef.current;
    const knownOrderIds = knownOrderIdsRef.current;
    const newIds = [];

    orders.forEach((order) => {
      if (!knownOrderIds.has(order.id)) {
        const createdAt = new Date(order.createdAt).getTime();
        const createdAfterView = Number.isFinite(createdAt) ? createdAt >= viewStartAt : true;
        if (createdAfterView) {
          newIds.push(order.id);
        }
      }
      knownOrderIds.add(order.id);
    });

    if (newIds.length > 0) {
      setNewOrderIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  }, [orders, isLoadingOrders]);
  
  const statuses = ['PENDING', 'APPROVED', 'NOT_FULFILLING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

  const formatOrderDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };
  
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
    setEditingStatusId(null);
    performStatusUpdate(orderId, newStatus);
  };

  const performStatusUpdate = (orderId, newStatus) => {
    setUpdatingOrderId(orderId);
    Promise.resolve(updateOrderStatus(orderId, newStatus)).finally(() => setUpdatingOrderId(null));
  };

  const handleQuickAction = (orderId, newStatus) => {
    if (newStatus === 'NOT_FULFILLING') {
      showConfirmDialog(
        'Mark as Not Fulfilling',
        'Mark this order as Not Fulfilling? The customer will no longer expect this order to be fulfilled.',
        () => performStatusUpdate(orderId, newStatus)
      );
      return;
    }
    if (newStatus === 'DELIVERED') {
      showConfirmDialog(
        'Mark as Delivered',
        `Mark order #${orderId} as Delivered?`,
        () => performStatusUpdate(orderId, newStatus)
      );
      return;
    }
    performStatusUpdate(orderId, newStatus);
  };

  const getNextStatusActions = (currentStatus) => {
    switch(currentStatus) {
      case 'PENDING':
        return [
          { status: 'APPROVED', label: 'Mark as Approved', icon: <Check size={16} />, className: 'btn-quick-action-approve', ariaLabel: 'Mark order as Approved' },
          { status: 'NOT_FULFILLING', label: 'Mark as Not Fulfilling', icon: <XCircle size={16} />, className: 'btn-quick-action-reject', ariaLabel: 'Mark order as Not Fulfilling' }
        ];
      case 'APPROVED':
        return [
          { status: 'READY_FOR_DELIVERY', label: 'Mark Ready for Delivery', icon: <PackageCheck size={16} />, className: 'btn-quick-action-ready', ariaLabel: 'Mark order Ready for Delivery' }
        ];
      case 'READY_FOR_DELIVERY':
        return [
          { status: 'OUT_FOR_DELIVERY', label: 'Mark Out for Delivery', icon: <TruckIcon size={16} />, className: 'btn-quick-action-deliver', ariaLabel: 'Mark order Out for Delivery' }
        ];
      case 'OUT_FOR_DELIVERY':
        return [
          { status: 'DELIVERED', label: 'Mark Delivered', icon: <CheckCheck size={16} />, className: 'btn-quick-action-complete', ariaLabel: 'Mark order as Delivered' }
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
            {isCustomerOnly ? 'My Orders' : 'Orders'}
          </h2>
          <p className="page-subtitle">
            {showAllOrders 
              ? `${filteredOrders.length} ${filteredOrders.length === 1 ? 'order' : 'orders'} total`
              : `${filteredOrders.length} open ${filteredOrders.length === 1 ? 'order' : 'orders'}`
            }
            {!isCustomerOnly && !showAllOrders && totalOrdersCount > openOrdersCount && (
              <span className="orders-hidden-count"> ({totalOrdersCount - openOrdersCount} completed hidden)</span>
            )}
          </p>
        </div>
        <div className="orders-header-actions">
          {/* View Mode Toggle */}
          {!isCustomerOnly && (
            <div className="view-toggle">
              <button
                onClick={() => setViewMode('card')}
                className={`btn-view-toggle ${viewMode === 'card' ? 'active' : ''}`}
                title="Card view"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`btn-view-toggle ${viewMode === 'list' ? 'active' : ''}`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>
          )}
          
          {/* Show All Toggle */}
          {!isCustomerOnly && (
            <button
              onClick={() => setShowAllOrders(!showAllOrders)}
              className={`btn-filter-toggle ${showAllOrders ? 'active' : ''}`}
              title={showAllOrders ? 'Show open orders only' : 'Show all orders'}
            >
              <Filter size={18} />
              <span>{showAllOrders ? 'All Orders' : 'Open Only'}</span>
            </button>
          )}
          
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
      </div>
      <HeaderDivider />

      <div className="orders-status-legend">
        {statuses.map(status => (
          <div key={status} className="orders-status-legend-item">
            <span className={`orders-status-legend-swatch ${getStatusClass(status)}`} />
            <span>{status.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      <div className={`orders-list ${viewMode === 'list' ? 'orders-list-compact' : ''}`}>
        {isLoadingOrders ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>{showAllOrders ? 'No orders found.' : 'No open orders. '} 
              {!showAllOrders && totalOrdersCount > 0 && (
                <button 
                  onClick={() => setShowAllOrders(true)} 
                  className="btn-link"
                >
                  Show all orders
                </button>
              )}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          // Compact List View
          <div className="orders-table">
            <div className="orders-table-header">
              <div className="orders-table-cell cell-id">Order</div>
              <div className="orders-table-cell cell-customer">Customer</div>
              <div className="orders-table-cell cell-payment">Payment</div>
              <div className="orders-table-cell cell-items">Items</div>
              <div className="orders-table-cell cell-total">Total</div>
              <div className="orders-table-cell cell-status">Current Status</div>
              <div className="orders-table-cell cell-actions" title="Update order status">Status actions</div>
              <div className="orders-table-cell cell-more">More</div>
            </div>
            {filteredOrders.map(order => {
              const nextActions = canModifyOrders ? getNextStatusActions(order.status) : [];
              const isNewOrder = newOrderIds.includes(order.id);
              const itemCount = order.items?.filter(i => !i.voided).length || 0;
              
              return (
                <div 
                  key={order.id} 
                  className={`orders-table-row ${isNewOrder ? 'orders-table-row-new' : ''}`}
                >
                  <div className="orders-table-cell cell-id">
                    <span className="order-id-compact">#{order.id}</span>
                    {isNewOrder && <span className="order-new-badge-small">New</span>}
                  </div>
                  <div className="orders-table-cell cell-customer">
                    <span className="customer-name-compact">{order.user?.name || 'N/A'}</span>
                  </div>
                  <div className="orders-table-cell cell-payment">
                    <span className={`payment-compact ${order.user?.cashapp ? 'has-payment' : 'no-payment'}`}>
                      {order.user?.cashapp || '—'}
                    </span>
                  </div>
                  <div className="orders-table-cell cell-items">
                    <span className="items-count">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="orders-table-cell cell-total">
                    <span className="total-compact">${order.total.toFixed(2)}</span>
                  </div>
                  <div className="orders-table-cell cell-status">
                    <div className={`status-badge-compact ${getStatusClass(order.status)}`}>
                      {getStatusIcon(order.status)}
                      <span>{order.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div className="orders-table-cell cell-actions">
                    {nextActions.length > 0 && nextActions.map(action => (
                      <button
                        key={action.status}
                        onClick={() => handleQuickAction(order.id, action.status)}
                        className={`btn-quick-action-compact ${action.className}`}
                        title={action.label}
                        aria-label={action.ariaLabel ?? action.label}
                        disabled={updatingOrderId === order.id}
                      >
                        {action.icon}
                      </button>
                    ))}
                  </div>
                  <div className="orders-table-cell cell-more">
                    <button
                      onClick={() => {
                        setViewMode('card');
                        setTimeout(() => {
                          const element = document.getElementById(`order-${order.id}`);
                          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                      }}
                      className="btn-view-order"
                      title="View order details"
                      aria-label="View order details"
                    >
                      <span>View</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Card View
          filteredOrders.map(order => {
            const nextActions = canModifyOrders ? getNextStatusActions(order.status) : [];
            const isEditing = editingOrderId === order.id;
            const canEdit = canModifyOrders && order.status !== 'DELIVERED';
            const isNewOrder = newOrderIds.includes(order.id);
            
            return (
              <div key={order.id} id={`order-${order.id}`} className={`order-card surface-card ${isNewOrder ? 'order-card-new' : ''}`}>
                <div className="order-header">
                  <div className="order-info">
                    <h3 className="order-id">
                      Order #{order.id}
                      {isNewOrder && <span className="order-new-badge">New</span>}
                    </h3>
                    <div className="order-meta">
                      <span className="order-date">{formatOrderDate(order.createdAt)}</span>
                      <span className="order-separator">•</span>
                      <span className="order-total">${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Order status: current status + update controls + next-step actions */}
                <div className="order-status-block">
                  <h4 className="order-status-block-title">Order status</h4>
                  {editingStatusId === order.id && canModifyOrders ? (
                    <div className="status-selector">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className="status-select"
                        disabled={updatingOrderId === order.id}
                        aria-label="Change order status"
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
                    <>
                      <div className="order-status-container">
                        <div className={`order-status ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          <span>{order.status.replace(/_/g, ' ')}</span>
                        </div>
                        {canModifyOrders && (
                          <button
                            onClick={() => setEditingStatusId(order.id)}
                            className="btn-change-status"
                            title="Change status (other options)"
                            aria-label="Change status to any option"
                            disabled={updatingOrderId === order.id}
                          >
                            <RefreshCw size={16} />
                          </button>
                        )}
                      </div>
                      {nextActions.length > 0 && (
                        <div className="order-quick-actions">
                          <span className="order-quick-actions-label">Move to next:</span>
                          {nextActions.map(action => (
                            <button
                              key={action.status}
                              onClick={() => handleQuickAction(order.id, action.status)}
                              className={`btn-quick-action ${action.className}`}
                              title={action.ariaLabel ?? action.label}
                              aria-label={action.ariaLabel ?? action.label}
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

                {/* Customer Details - Only visible to management/admin */}
                {canModifyOrders && order.user && (
                  <div className="order-customer-details">
                    <h4 className="order-customer-title">
                      <User size={16} />
                      Customer Details
                    </h4>
                    <div className="order-customer-info">
                      <div className="customer-info-row">
                        <span className="customer-info-label">Name:</span>
                        <span className="customer-info-value">{order.user.name || 'N/A'}</span>
                      </div>
                      <div className="customer-info-row">
                        <CreditCard size={14} className="customer-info-icon" />
                        <span className="customer-info-label">Payment:</span>
                        <span className={`customer-info-value ${order.user.cashapp ? 'payment-cashapp' : 'payment-none'}`}>
                          {order.user.cashapp || 'No payment method'}
                        </span>
                      </div>
                      {order.user.phoneNumber && (
                        <div className="customer-info-row">
                          <Phone size={14} className="customer-info-icon" />
                          <span className="customer-info-label">Phone:</span>
                          <span className="customer-info-value">{order.user.phoneNumber}</span>
                        </div>
                      )}
                      {order.user.address && (
                        <div className="customer-info-row">
                          <MapPin size={14} className="customer-info-icon" />
                          <span className="customer-info-label">Address:</span>
                          <span className="customer-info-value">{order.user.address}</span>
                        </div>
                      )}
                    </div>
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

                {/* Help Button - Visible to all users */}
                <div className="order-help-section">
                  <button
                    onClick={() => navigate(`/help?orderId=${order.id}`)}
                    className="btn-order-help"
                  >
                    <HelpCircle size={16} />
                    <span>Need Help with this Order?</span>
                  </button>
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