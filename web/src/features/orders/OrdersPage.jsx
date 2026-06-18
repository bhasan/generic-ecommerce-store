import React, { useState, useEffect, useRef } from 'react';
import './OrdersPage.css';
import { useApp } from '../../context/AppContext';
import {
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
  X,
  Minus,
  Edit,
  Save,
  HelpCircle,
  User,
  CreditCard,
  Phone,
  MapPin,
  ChevronRight,
  Search
} from 'lucide-react';
import Fuse from 'fuse.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HeaderDivider from '../../components/common/HeaderDivider';
import { hasRole, ROLES } from '../../utils/roles';
import OrderDetailPanel from './OrderDetailPanel';
import CustomerOrderList from './CustomerOrderList';
import { OrderStatus } from '../../constants/orderStatuses';

const FILTER_STATUSES = Object.values(OrderStatus);
const DEFAULT_SELECTED_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.APPROVED,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.ARRIVED
];
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

const COLUMN_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Prep Orders',
  NOT_FULFILLING: 'Rejected (Invalid Payment)',
  READY_FOR_DELIVERY: 'Awaiting Delivery Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  READY_FOR_PICKUP: 'Ready for Pickup',
  ARRIVED: 'Customer Arrived',
  PICKED_UP: 'Picked Up'
};

function OrdersPage({ forceCustomerView = false }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const {
    currentUser,
    orders,
    products,
    isLoadingOrders,
    loadOrders,
    updateOrderStatus,
    deleteOrder,
    printOrderReceipt,
    addItemToOrder,
    voidOrderItem,
    deleteOrderItem,
    restoreOrder
  } = useApp();

  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [originalOrderState, setOriginalOrderState] = useState(null);
  const [addingItemToOrderId, setAddingItemToOrderId] = useState(null);
  const [newItemVariantId, setNewItemVariantId] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [newOrderIds, setNewOrderIds] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState(() => {
    const s = searchParams.get('status');
    if (!s) return [...DEFAULT_SELECTED_STATUSES];
    const list = s.split(',').filter((x) => FILTER_STATUSES.includes(x));
    return list.length > 0 ? list : [...DEFAULT_SELECTED_STATUSES];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const knownOrderIdsRef = useRef(new Set());
  const viewStartAtRef = useRef(Date.now());
  const hasInitializedOrdersRef = useRef(false);
  const ordersRef = useRef(orders);
  const previousStatusesRef = useRef({});

  const playArrivalChime = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, now); // G5
      gain1.gain.setValueAtTime(0.1, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, now + 0.15); // C6
      gain2.gain.setValueAtTime(0.1, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.5);
    } catch (err) {
      console.error('Failed to play arrival chime:', err);
    }
  };

  const isCustomerOnly =
    forceCustomerView || (
      hasRole(currentUser, ROLES.CUSTOMER) &&
      !hasRole(currentUser, ROLES.EMPLOYEE) &&
      !hasRole(currentUser, ROLES.MANAGEMENT) &&
      !hasRole(currentUser, ROLES.ADMIN)
    );
  const canModifyOrders =
    hasRole(currentUser, ROLES.EMPLOYEE) || hasRole(currentUser, ROLES.MANAGEMENT) || hasRole(currentUser, ROLES.ADMIN);

  useEffect(() => {
    const s = searchParams.get('status');
    if (!s) {
      setSelectedStatuses([...DEFAULT_SELECTED_STATUSES]);
      return;
    }
    const list = s.split(',').filter((x) => FILTER_STATUSES.includes(x));
    setSelectedStatuses(list.length > 0 ? list : [...DEFAULT_SELECTED_STATUSES]);
  }, [urlStatus]);

  const toggleStatusFilter = (status) => {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((x) => x !== status)
      : [...selectedStatuses, status];
    const safeNext = next.length > 0 ? next : [...DEFAULT_SELECTED_STATUSES];
    // Mirror filter state into the URL so staff can refresh or share the same kanban view.
    setSelectedStatuses(safeNext);
    const isDefault = safeNext.length === DEFAULT_SELECTED_STATUSES.length &&
      DEFAULT_SELECTED_STATUSES.every((x) => safeNext.includes(x));
    setSearchParams(
      isDefault ? {} : { status: safeNext.join(',') },
      { replace: true }
    );
  };

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
  };

  const fuse = React.useMemo(() => {
    return new Fuse(orders, {
      keys: [
        { name: 'id', weight: 1 },
        { name: 'user.username', weight: 0.7 },
        { name: 'user.cashapp', weight: 0.5 },
        { name: 'user.phoneNumber', weight: 0.5 },
        { name: 'user.address', weight: 0.4 }
      ],
      threshold: 0.3,
      ignoreLocation: true,
      useExtendedSearch: true
    });
  }, [orders]);

  const filteredOrders = React.useMemo(() => {
    let result = orders;

    // Apply fuzzy search if query exists
    if (searchQuery.trim()) {
      result = fuse.search(searchQuery).map((r) => r.item);
    }

    // Apply existing tab/status filters
    return result.filter((o) => {
      if (isCustomerOnly && o.userId !== currentUser.id) return false;
      if (!selectedStatuses.includes(o.status)) return false;
      if ((o.status === OrderStatus.DELIVERED || o.status === OrderStatus.PICKED_UP) && !isToday(o.updatedAt)) return false;
      return true;
    });
  }, [orders, searchQuery, selectedStatuses, fuse, currentUser.id, isCustomerOnly]);

  const columnsToShow = selectedStatuses.length > 0 ? selectedStatuses : [...DEFAULT_SELECTED_STATUSES];
  const ordersByStatus = columnsToShow.reduce((acc, s) => {
    acc[s] = filteredOrders.filter((o) => o.status === s);
    return acc;
  }, {});

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    loadOrders();
    const handleFocus = () => {
      // Reset new-order highlighting when the user returns so only fresh arrivals after that moment stand out.
      viewStartAtRef.current = Date.now();
      setNewOrderIds([]);
      knownOrderIdsRef.current = new Set(ordersRef.current.map((o) => o.id));
      // Silent refresh on focus — no loading spinner, avoids disrupting the current view.
      loadOrders(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadOrders]);

  useEffect(() => {
    if (isLoadingOrders) return;
    if (!hasInitializedOrdersRef.current) {
      knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
      const statuses = {};
      orders.forEach((o) => {
        statuses[o.id] = o.status;
      });
      previousStatusesRef.current = statuses;
      hasInitializedOrdersRef.current = true;
      return;
    }
    const viewStartAt = viewStartAtRef.current;
    const knownOrderIds = knownOrderIdsRef.current;
    const newIds = [];
    
    let shouldPlayChime = false;
    const nextStatuses = {};

    // New badges are limited to orders created while this board view has been open.
    orders.forEach((o) => {
      nextStatuses[o.id] = o.status;
      
      const prevStatus = previousStatusesRef.current[o.id];
      if (o.status === 'ARRIVED' && prevStatus !== 'ARRIVED') {
        shouldPlayChime = true;
      }

      if (!knownOrderIds.has(o.id)) {
        const createdAt = new Date(o.createdAt).getTime();
        if (Number.isFinite(createdAt) && createdAt >= viewStartAt) newIds.push(o.id);
      }
      knownOrderIds.add(o.id);
    });

    previousStatusesRef.current = nextStatuses;
    if (shouldPlayChime) {
      playArrivalChime();
    }

    if (newIds.length > 0) setNewOrderIds((prev) => Array.from(new Set([...prev, ...newIds])));
  }, [orders, isLoadingOrders]);

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

  const performStatusUpdate = (orderId, newStatus) => {
    setUpdatingOrderId(orderId);
    // Track the in-flight order so the same card cannot trigger overlapping status transitions.
    Promise.resolve(updateOrderStatus(orderId, newStatus)).finally(() => setUpdatingOrderId(null));
  };

  const handleQuickAction = (orderId, newStatus) => {
    if (newStatus === OrderStatus.NOT_FULFILLING) {
      setConfirmDialog({
        title: 'Reject Order (Invalid Payment)',
        message: 'Reject this order due to invalid payment? This action is permanent.',
        onConfirm: () => performStatusUpdate(orderId, newStatus)
      });
      return;
    }
    if (newStatus === OrderStatus.DELIVERED) {
      setConfirmDialog({
        title: 'Mark as Delivered',
        message: `Mark order #${orderId} as Delivered?`,
        onConfirm: () => performStatusUpdate(orderId, newStatus)
      });
      return;
    }
    if (newStatus === OrderStatus.PICKED_UP) {
      const order = orders.find((o) => o.id === orderId);
      const isPayInStore = order?.paymentMethod === 'IN_STORE';
      setConfirmDialog({
        title: 'Take Payment in Store',
        message: `Order Total: $${order.total.toFixed(2)}\n\nâš ï¸ REMINDER: Please ensure payment has been collected before proceeding.`,
        confirmLabel: 'Paid',
        confirmVariant: 'success',
        onConfirm: () => performStatusUpdate(orderId, newStatus)
      });
      return;
    }
    performStatusUpdate(orderId, newStatus);
  };

  const getNextStatusActions = (order) => {
    const currentStatus = order.status;
    const isPickup = order.deliveryMethod === 'PICKUP' || order.deliveryMethod === 'CURBSIDE';

    switch (currentStatus) {
      case 'PENDING':
        return [
          { status: 'APPROVED', label: 'Approve (Payment Verified)', icon: <Check size={16} />, className: 'btn-quick-action-approve' },
          { status: 'NOT_FULFILLING', label: 'Reject Order (Invalid Payment)', icon: <XCircle size={16} />, className: 'btn-quick-action-reject' }
        ];
      case 'APPROVED':
        return isPickup
          ? [{ status: 'READY_FOR_PICKUP', label: STATUS_LABELS.READY_FOR_PICKUP, icon: <PackageCheck size={16} />, className: 'btn-quick-action-ready' }]
          : [{ status: 'READY_FOR_DELIVERY', label: STATUS_LABELS.READY_FOR_DELIVERY, icon: <PackageCheck size={16} />, className: 'btn-quick-action-ready' }];
      case 'READY_FOR_DELIVERY':
        return [{ status: 'OUT_FOR_DELIVERY', label: STATUS_LABELS.OUT_FOR_DELIVERY, icon: <TruckIcon size={16} />, className: 'btn-quick-action-deliver' }];
      case 'OUT_FOR_DELIVERY':
        return [{ status: 'DELIVERED', label: STATUS_LABELS.DELIVERED, icon: <CheckCheck size={16} />, className: 'btn-quick-action-complete' }];
      case 'READY_FOR_PICKUP':
        return [{ status: 'PICKED_UP', label: STATUS_LABELS.PICKED_UP, icon: <CheckCheck size={16} />, className: 'btn-quick-action-complete' }];
      case 'ARRIVED':
        return [{ status: 'PICKED_UP', label: STATUS_LABELS.PICKED_UP, icon: <CheckCheck size={16} />, className: 'btn-quick-action-complete' }];
      default:
        return [];
    }
  };

  const handleAddItem = (orderId) => {
    if (!newItemVariantId) return;
    addItemToOrder(orderId, parseInt(newItemVariantId, 10), newItemQuantity);
    setAddingItemToOrderId(null);
    setNewItemVariantId('');
    setNewItemQuantity(1);
  };

  const showConfirmDialog = (title, message, onConfirm) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  const handleVoidItem = (orderId, itemIdOrIdx, itemName) => {
    showConfirmDialog(
      'Void Item',
      `Void "${itemName}"? This will exclude it from the order total.`,
      () => voidOrderItem(orderId, itemIdOrIdx)
    );
  };

  const handleDeleteItem = (orderId, itemIdOrIdx, itemName) => {
    showConfirmDialog('Delete Item', `Permanently delete "${itemName}" from this order?`, () => {
      deleteOrderItem(orderId, itemIdOrIdx);
      const order = orders.find((o) => o.id === orderId);
      if (order?.items?.length === 1) setEditingOrderId(null);
    });
  };

  const toggleEditOrder = (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (editingOrderId === orderId) return;
    // Snapshot the original order so cancel can restore local edits without another fetch.
    setOriginalOrderState(JSON.parse(JSON.stringify(order)));
    setEditingOrderId(orderId);
  };

  const handleSaveOrder = () => {
    setEditingOrderId(null);
    setOriginalOrderState(null);
    setAddingItemToOrderId(null);
    setNewItemVariantId('');
    setNewItemQuantity(1);
  };

  const handleCancelOrder = () => {
    if (originalOrderState && restoreOrder) restoreOrder(originalOrderState);
    setEditingOrderId(null);
    setOriginalOrderState(null);
    setAddingItemToOrderId(null);
    setNewItemVariantId('');
    setNewItemQuantity(1);
  };

  const handleConfirm = () => {
    if (confirmDialog?.onConfirm) confirmDialog.onConfirm();
    setConfirmDialog(null);
  };

  const handleDragStart = (e, order) => {
    e.dataTransfer.setData('orderId', String(order.id));
    e.dataTransfer.setData('currentStatus', order.status);
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('kanban-card-dragging');
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('kanban-card-dragging');
  };

  const handleDragOver = (e, targetStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('kanban-column-drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('kanban-column-drag-over');
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    e.currentTarget.classList.remove('kanban-column-drag-over');
    const orderId = e.dataTransfer.getData('orderId');
    const currentStatus = e.dataTransfer.getData('currentStatus');
    if (!orderId || currentStatus === targetStatus) return;
    const order = orders.find((o) => o.id === parseInt(orderId, 10));
    if (!order || order.status !== currentStatus) return;
    performStatusUpdate(parseInt(orderId, 10), targetStatus);
  };

  const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : null;

  // Customers get a dedicated list view — no kanban, no staff-only controls.
  if (isCustomerOnly) {
    const myOrders = orders.filter((o) => o.userId === currentUser.id);
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
            showConfirmDialog={showConfirmDialog}
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

  return (
    <div className="orders-page-container orders-page-kanban">
      <div className="orders-header section-header-surface">
        <div>
          <h2 className="page-title">{isCustomerOnly ? 'My Orders' : 'Orders'}</h2>
          <p className="page-subtitle">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} shown
          </p>
        </div>
        <div className="orders-header-actions">
          <div className="orders-search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search ID, customer, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="orders-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
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
      </div>
      <HeaderDivider />

      <div className="orders-status-filters">
        <span className="orders-filters-label">Show columns:</span>
        {FILTER_STATUSES.map((s) => {
          const count = orders.filter((o) => {
            if (isCustomerOnly && o.userId !== currentUser.id) return false;
            if (o.status !== s) return false;
            if ((s === OrderStatus.DELIVERED || s === OrderStatus.PICKED_UP) && !isToday(o.updatedAt)) return false;
            return true;
          }).length;
          const isChecked = selectedStatuses.includes(s);
          return (
            <label key={s} className={`orders-filter-checkbox ${isChecked ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleStatusFilter(s)}
              />
              <span className="orders-filter-text">{COLUMN_LABELS[s]} ({count})</span>
            </label>
          );
        })}
      </div>

      <div className="orders-kanban">
        {isLoadingOrders ? (
          <div className="orders-empty-state">
            <Package size={64} className="empty-icon" />
            <p>Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="orders-empty-state">
            <Package size={64} className="empty-icon" />
            <p>No orders found.</p>
          </div>
        ) : (
          <div className="kanban-columns">
            {columnsToShow.map((status) => (
              <div
                key={status}
                className={`kanban-column kanban-column-${status.toLowerCase().replace(/_/g, '-')}`}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="kanban-column-header">
                  <span className="kanban-column-title">{COLUMN_LABELS[status]}</span>
                  <span className="kanban-column-count">{ordersByStatus[status]?.length ?? 0}</span>
                </div>
                <div className="kanban-column-cards">
                  {(ordersByStatus[status] ?? []).map((order) => {
                    const nextActions = canModifyOrders ? getNextStatusActions(order) : [];
                    const isNew = newOrderIds.includes(order.id);
                    const itemCount = order.items?.filter((i) => !i.voided).length ?? 0;
                    const isPickup = order.deliveryMethod === 'PICKUP' || order.deliveryMethod === 'CURBSIDE';
                    const isPayInStore = order.paymentMethod === 'IN_STORE';
                    const isExternal = order.paymentMethod === 'EXTERNAL';
                    const isPaid = order.paymentMethod === 'CREDIT' || (isExternal && order.status !== 'PENDING');
                    const needsVerification = isExternal && order.status === 'PENDING';

                    const isArrived = order.status === 'ARRIVED';
                    return (
                      <div
                        key={order.id}
                        className={`kanban-card surface-card ${isNew ? 'kanban-card-new' : ''} ${isArrived ? 'kanban-card-arrived' : ''} ${canModifyOrders ? 'kanban-card-draggable' : ''}`}
                        draggable={canModifyOrders}
                        onDragStart={(e) => handleDragStart(e, order)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="kanban-card-header">
                          <span className="kanban-card-id">#{order.id}</span>
                          <div className="kanban-card-badges">
                            {isNew && <span className="kanban-card-new-badge">New</span>}
                            <span className={`kanban-card-method-badge ${isPickup ? 'method-pickup' : 'method-delivery'}`}>
                              {order.deliveryMethod === 'CURBSIDE' ? 'Curbside' : (isPickup ? 'Pickup' : 'Delivery')}
                            </span>
                            {isPayInStore && (
                              <span className="kanban-card-payment-badge payment-store">Pay in Store</span>
                            )}
                            {isPaid && (
                              <span className="kanban-card-payment-badge payment-paid">Paid</span>
                            )}
                            {needsVerification && (
                              <span className="kanban-card-payment-badge payment-verify">Verify Payment</span>
                            )}
                          </div>
                        </div>
                        <div className="kanban-card-date">{formatOrderDate(order.createdAt)}</div>
                        <div className="kanban-card-customer">{order.user?.username ?? 'N/A'}</div>
                        {order.deliveryMethod === 'CURBSIDE' && order.deliveryAddress && (
                          <div className="kanban-card-vehicle">
                            <MapPin size={12} className="vehicle-icon" />
                            <span className="vehicle-info-text">{order.deliveryAddress.replace(/^CURBSIDE(:\s*|\s*\|\s*|$)/i, '') || 'CURBSIDE'}</span>
                          </div>
                        )}
                        <div className="kanban-card-meta">
                          ${order.total.toFixed(2)} · {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </div>
                        <div className={`kanban-card-payment-info ${order.user?.cashapp ? 'has' : 'none'}`}>
                          {order.user?.cashapp ? `@${order.user.cashapp}` : (isPayInStore ? 'Payment in Store' : 'No payment username')}
                        </div>
                        {nextActions.length > 0 && (
                          <div className="kanban-card-actions">
                            <span className="kanban-card-actions-label">Move Order Status To:</span>
                            <div className="kanban-card-actions-buttons">
                              {nextActions.map((action) => (
                                <button
                                  key={action.status}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickAction(order.id, action.status);
                                  }}
                                  className={`btn-quick-action-compact ${action.className}`}
                                  title={action.label}
                                  disabled={updatingOrderId === order.id}
                                >
                                  {action.icon}
                                  <span>{action.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="kanban-card-view"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          View details <ChevronRight size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
          products={products}
          canModifyOrders={canModifyOrders}
          canDeleteOrder={hasRole(currentUser, ROLES.ADMIN)}
          isEditing={editingOrderId === selectedOrder.id}
          onToggleEdit={toggleEditOrder}
          onSaveEdit={handleSaveOrder}
          onCancelEdit={handleCancelOrder}
          addingItemToOrderId={addingItemToOrderId}
          newItemVariantId={newItemVariantId}
          setNewItemVariantId={setNewItemVariantId}
          newItemQuantity={newItemQuantity}
          setNewItemQuantity={setNewItemQuantity}
          onAddItem={handleAddItem}
          onCancelAddItem={() => {
            setAddingItemToOrderId(null);
            setNewItemVariantId('');
            setNewItemQuantity(1);
          }}
          onStartAddItem={setAddingItemToOrderId}
          editingStatusId={editingStatusId}
          onStartEditStatus={setEditingStatusId}
          onStatusChange={(orderId, newStatus) => {
            setEditingStatusId(null);
            performStatusUpdate(orderId, newStatus);
          }}
          onCancelStatusEdit={() => setEditingStatusId(null)}
          updateOrderStatus={updateOrderStatus}
          onQuickAction={handleQuickAction}
          onVoidItem={handleVoidItem}
          onDeleteItem={handleDeleteItem}
          onDeleteOrder={deleteOrder}
          onPrintReceipt={printOrderReceipt}
          showConfirmDialog={showConfirmDialog}
          getProductName={getProductName}
          getStatusIcon={getStatusIcon}
          getStatusClass={getStatusClass}
          getStatusLabel={(s) => STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}
          formatOrderDate={formatOrderDate}
          getNextStatusActions={getNextStatusActions}
          navigate={navigate}
          updatingOrderId={updatingOrderId}
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
    </div>
  );
}

export default OrdersPage;
