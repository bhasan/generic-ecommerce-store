import React, { useState, useEffect, useCallback } from 'react';
import './DeliveryDriverDashboard.css';
import * as ordersApi from '../../services/ordersApi';
import { useApp } from '../../context/AppContext';
import { Truck, Package, MapPin, CheckCircle, Edit, X, Plus } from 'lucide-react';
import HeaderDivider from '../../components/common/HeaderDivider';

const MAX_ROUTE_ORDERS = 5;

function DeliveryDriverDashboard() {
  const { showNotification } = useApp();
  const [readyOrders, setReadyOrders] = useState([]);
  const [routeOrders, setRouteOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const [ready, outForDelivery] = await Promise.all([
        ordersApi.getReadyForDeliveryOrders(),
        ordersApi.getOutForDeliveryOrders()
      ]);
      setReadyOrders(ready);
      setRouteOrders(outForDelivery);
      // Initialize selected orders from current route
      setSelectedOrderIds(new Set(outForDelivery.map(o => o.id)));
    } catch (error) {
      showNotification(error.message || 'Failed to load orders', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleToggleOrderSelection = (orderId) => {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      if (newSelected.size >= MAX_ROUTE_ORDERS) {
        showNotification(`Maximum ${MAX_ROUTE_ORDERS} orders allowed in route`, 'error');
        return;
      }
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);
  };

  const handleSaveRoute = async () => {
    try {
      // Get orders to add (selected but not in route)
      const ordersToAdd = readyOrders.filter(o => 
        selectedOrderIds.has(o.id) && !routeOrders.some(ro => ro.id === o.id)
      );
      
      // Get orders to remove (in route but not selected)
      const ordersToRemove = routeOrders.filter(ro => !selectedOrderIds.has(ro.id));

      // Update status for orders being added to route
      for (const order of ordersToAdd) {
        await ordersApi.updateOrderStatus(order.id, 'OUT_FOR_DELIVERY');
      }

      // Update status for orders being removed from route
      for (const order of ordersToRemove) {
        await ordersApi.updateOrderStatus(order.id, 'READY_FOR_DELIVERY');
      }

      showNotification('Route updated successfully', 'success');
      setIsEditingRoute(false);
      loadOrders(); // Reload to reflect changes
    } catch (error) {
      showNotification(error.message || 'Failed to update route', 'error');
    }
  };

  const handleCancelEditRoute = () => {
    // Reset selection to current route
    setSelectedOrderIds(new Set(routeOrders.map(o => o.id)));
    setIsEditingRoute(false);
  };

  const handleMarkDelivered = async (orderId) => {
    try {
      await ordersApi.updateOrderStatus(orderId, 'DELIVERED');
      showNotification('Order marked as delivered', 'success');
      loadOrders(); // Reload to remove the delivered order
    } catch (error) {
      showNotification(error.message || 'Failed to mark order as delivered', 'error');
    }
  };

  const renderOrderCard = (order, isInRoute = false, showCheckbox = false) => {
    const itemsSummary = order.items && order.items.length > 0
      ? order.items
          .filter(item => !item.voided)
          .map(item => `${item.productName} (${item.quantity})`)
          .join(', ')
      : 'No items';

    const handleCardClick = (e) => {
      // Don't toggle if clicking on the delivered button or checkbox
      if (e.target.closest('.btn-delivered-small') || e.target.type === 'checkbox') {
        return;
      }
      // Toggle selection when clicking anywhere else on the card
      if (isEditingRoute) {
        handleToggleOrderSelection(order.id);
      }
    };

    return (
      <div 
        key={order.id} 
        className={`delivery-order-item ${isInRoute ? 'route-order' : ''} ${selectedOrderIds.has(order.id) && isEditingRoute ? 'selected' : ''} ${isEditingRoute ? 'editable' : ''}`}
        onClick={isEditingRoute ? handleCardClick : undefined}
      >
        {showCheckbox && (
          <input
            type="checkbox"
            checked={selectedOrderIds.has(order.id)}
            onChange={() => handleToggleOrderSelection(order.id)}
            disabled={!isEditingRoute}
            className="order-checkbox"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="order-item-content">
          <div className="order-item-header">
            <span className="order-id">Order: #{order.id}</span>
            {isInRoute && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkDelivered(order.id);
                }}
                className="btn-delivered-small"
                title="Mark as delivered"
              >
                <CheckCircle size={16} />
              </button>
            )}
          </div>
          {order.user && order.user.address && (
            <div className="order-address">
              <MapPin size={14} />
              <span>{order.user.address}</span>
            </div>
          )}
          <div className="order-items-summary">
            <span>{itemsSummary}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="delivery-dashboard-container">
      <div className="delivery-dashboard-header section-header-surface">
        <div>
          <h2 className="page-title">
            <Truck size={28} />
            Delivery Dashboard
          </h2>
          <p className="page-subtitle">Manage your delivery route</p>
        </div>
      </div>
      <HeaderDivider />

      {/* Split View Container */}
      <div className="delivery-split-view">
        {/* Left Panel: Ready for Delivery */}
        <div className="delivery-panel delivery-panel-left">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Package size={20} />
                Ready for Delivery
              </h3>
              <p className="panel-subtitle">
                {isEditingRoute 
                  ? `${selectedOrderIds.size}/${MAX_ROUTE_ORDERS} selected`
                  : `${readyOrders.length} available`
                }
              </p>
            </div>
          </div>
          <div className="panel-content">
            {isLoading ? (
              <div className="empty-state-small">
                <Package size={32} className="empty-icon" />
                <p>Loading orders...</p>
              </div>
            ) : readyOrders.length === 0 ? (
              <div className="empty-state-small">
                <Package size={32} className="empty-icon" />
                <p>No orders ready for delivery</p>
              </div>
            ) : (
              <div className="orders-list">
                {readyOrders.map(order => renderOrderCard(order, false, isEditingRoute))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Out for Delivery */}
        <div className="delivery-panel delivery-panel-right">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">
                <Truck size={20} />
                Out for Delivery
              </h3>
              <p className="panel-subtitle">
                {routeOrders.length > 0 ? `${routeOrders.length}/${MAX_ROUTE_ORDERS} orders` : 'No active route'}
              </p>
            </div>
            {routeOrders.length > 0 && !isEditingRoute && (
              <button
                onClick={() => setIsEditingRoute(true)}
                className="btn-edit-route"
              >
                <Edit size={16} />
                <span>Edit</span>
              </button>
            )}
            {isEditingRoute && (
              <div className="route-edit-actions">
                <button
                  onClick={handleSaveRoute}
                  className="btn-save-route"
                >
                  <CheckCircle size={16} />
                  <span>Save</span>
                </button>
                <button
                  onClick={handleCancelEditRoute}
                  className="btn-cancel-route"
                >
                  <X size={16} />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
          <div className="panel-content">
            {routeOrders.length === 0 ? (
              <div className="empty-state-small">
                <Truck size={32} className="empty-icon" />
                <p>No active route</p>
                {!isEditingRoute && (
                  <button
                    onClick={() => setIsEditingRoute(true)}
                    className="btn-start-route"
                  >
                    <Plus size={16} />
                    <span>Start Route</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="orders-list">
                {routeOrders.map(order => renderOrderCard(order, true, isEditingRoute))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeliveryDriverDashboard;

