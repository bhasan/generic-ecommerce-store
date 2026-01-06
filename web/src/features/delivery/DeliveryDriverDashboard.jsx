import React, { useState, useEffect, useCallback } from 'react';
import './DeliveryDriverDashboard.css';
import * as ordersApi from '../../services/ordersApi';
import { useApp } from '../../context/AppContext';
import { Truck, Package, MapPin, Calendar, CheckCircle, Edit, X, Plus } from 'lucide-react';

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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

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

  const renderOrderCard = (order, isInRoute = false, showCheckbox = false) => (
    <div key={order.id} className={`delivery-order-card ${isInRoute ? 'route-order' : ''}`}>
      {showCheckbox && (
        <div className="order-checkbox-container">
          <input
            type="checkbox"
            checked={selectedOrderIds.has(order.id)}
            onChange={() => handleToggleOrderSelection(order.id)}
            disabled={!isEditingRoute}
            className="order-checkbox"
          />
        </div>
      )}
      <div className="delivery-order-header">
        <div className="delivery-order-id">
          <Package size={20} />
          <span>Order #{order.id}</span>
        </div>
      </div>

      {order.user && order.user.address && (
        <div className="delivery-customer-info">
          <div className="customer-details">
            <div className="customer-detail-item customer-address">
              <MapPin size={16} />
              <span>{order.user.address}</span>
            </div>
          </div>
        </div>
      )}

      <div className="delivery-order-items">
        <h5 className="order-items-title">Order Items:</h5>
        <div className="order-items-list">
          {order.items && order.items.length > 0 ? (
            order.items
              .filter(item => !item.voided)
              .map(item => (
                <div key={item.id} className="order-item-row">
                  <div className="order-item-info">
                    {item.productImage && (
                      <img 
                        src={item.productImage} 
                        alt={item.productName}
                        className="order-item-image"
                      />
                    )}
                    <div className="order-item-details">
                      <span className="order-item-name">{item.productName}</span>
                      <span className="order-item-quantity">
                        Quantity: {item.quantity}
                      </span>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <p className="no-items">No items in this order</p>
          )}
        </div>
      </div>

      <div className="delivery-order-footer">
        <div className="delivery-order-date">
          <Calendar size={16} />
          <span>Ready: {formatDate(order.createdAt)}</span>
        </div>
        {isInRoute && (
          <button
            onClick={() => handleMarkDelivered(order.id)}
            className="btn-delivered"
          >
            <CheckCircle size={18} />
            <span>Delivered</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="delivery-dashboard-container">
      <div className="delivery-dashboard-header">
        <div>
          <h2 className="page-title">
            <Truck size={28} />
            Delivery Dashboard
          </h2>
          <p className="page-subtitle">Manage your delivery route</p>
        </div>
      </div>

      {/* Current Route Section */}
      {routeOrders.length > 0 && (
        <div className="current-route-section">
          <div className="route-header">
            <div>
              <h3 className="route-title">
                <Truck size={20} />
                Current Route ({routeOrders.length}/{MAX_ROUTE_ORDERS})
              </h3>
              <p className="route-subtitle">Orders out for delivery</p>
            </div>
            {!isEditingRoute && (
              <button
                onClick={() => setIsEditingRoute(true)}
                className="btn-edit-route"
              >
                <Edit size={18} />
                <span>Edit Route</span>
              </button>
            )}
            {isEditingRoute && (
              <div className="route-edit-actions">
                <button
                  onClick={handleSaveRoute}
                  className="btn-save-route"
                >
                  <CheckCircle size={18} />
                  <span>Save Route</span>
                </button>
                <button
                  onClick={handleCancelEditRoute}
                  className="btn-cancel-route"
                >
                  <X size={18} />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
          <div className="route-orders-list">
            {routeOrders.map(order => renderOrderCard(order, true, isEditingRoute))}
          </div>
        </div>
      )}

      {/* Ready for Delivery Section */}
      <div className="ready-orders-section">
        <div className="section-header">
          <h3 className="section-title">
            <Package size={20} />
            Ready for Delivery
            {isEditingRoute && (
              <span className="selection-info">
                ({selectedOrderIds.size}/{MAX_ROUTE_ORDERS} selected)
              </span>
            )}
          </h3>
          {routeOrders.length === 0 && !isEditingRoute && (
            <button
              onClick={() => setIsEditingRoute(true)}
              className="btn-start-route"
            >
              <Plus size={18} />
              <span>Start Route</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>Loading orders...</p>
          </div>
        ) : readyOrders.length === 0 ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>No orders ready for delivery at this time.</p>
          </div>
        ) : (
          <div className="delivery-orders-list">
            {readyOrders.map(order => renderOrderCard(order, false, isEditingRoute))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DeliveryDriverDashboard;

