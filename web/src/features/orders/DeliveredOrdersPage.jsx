import React, { useState, useEffect, useCallback } from 'react';
import './DeliveredOrdersPage.css';
import * as ordersApi from '../../services/ordersApi';
import { useApp } from '../../context/AppContext';
import { Package, User, MapPin, Phone, Mail, Calendar, CheckCircle } from 'lucide-react';
import ProductImage from '../products/ProductImage';

function DeliveredOrdersPage() {
  const { showNotification, currentUser } = useApp();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const deliveredOrders = await ordersApi.getDeliveredOrders();
      setOrders(deliveredOrders);
    } catch (error) {
      showNotification(error.message || 'Failed to load delivered orders', 'error');
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
  const canViewSensitive = userRoles.includes('ADMIN') || userRoles.includes('MANAGEMENT');

  return (
    <div className="delivered-orders-container">
      <div className="delivered-orders-header section-header-surface">
        <div>
          <h2 className="page-title">
            <CheckCircle size={28} />
            Delivered Orders
          </h2>
          <p className="page-subtitle">All delivered orders (latest first)</p>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Package size={64} className="empty-icon" />
          <p>Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <Package size={64} className="empty-icon" />
          <p>No delivered orders yet.</p>
        </div>
      ) : (
        <div className="delivered-orders-list">
          {orders.map(order => (
            <div key={order.id} className="delivered-order-card">
              <div className="delivered-order-header">
                <div className="delivered-order-id">
                  <Package size={20} />
                  <span>Order #{order.id}</span>
                </div>
                <div className="delivered-order-total">
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>

              {order.user && (
                <div className="delivered-customer-info">
                  <div className="customer-info-header">
                    <User size={18} />
                    <h4 className="customer-name">{order.user.name}</h4>
                  </div>
                  {canViewSensitive && (
                    <div className="customer-details">
                      {order.user.email && (
                        <div className="customer-detail-item">
                          <Mail size={16} />
                          <span>{order.user.email}</span>
                        </div>
                      )}
                      {order.user.phoneNumber && (
                        <div className="customer-detail-item">
                          <Phone size={16} />
                          <span>{order.user.phoneNumber}</span>
                        </div>
                      )}
                      {order.user.address && (
                        <div className="customer-detail-item customer-address">
                          <MapPin size={16} />
                          <span>{order.user.address}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="delivered-order-items">
                <h5 className="order-items-title">Order Items:</h5>
                <div className="order-items-list">
                  {order.items && order.items.length > 0 ? (
                    order.items
                      .filter(item => !item.voided)
                      .map(item => (
                        <div key={item.id} className="order-item-row">
                          <div className="order-item-info">
                            <ProductImage
                              src={item.productImage}
                              alt={item.productName}
                              className="order-item-image"
                            />
                            <div className="order-item-details">
                              <span className="order-item-name">{item.productName}</span>
                              <span className="order-item-price">
                                {formatCurrency(item.price)} × {item.quantity} = {formatCurrency(item.price * item.quantity)}
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

              <div className="delivered-order-footer">
                <div className="delivered-order-date">
                  <Calendar size={16} />
                  <span>Delivered: {formatDate(order.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeliveredOrdersPage;

