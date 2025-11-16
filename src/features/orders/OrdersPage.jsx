import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Check, Trash2, Package, Clock, Truck, CheckCircle, RefreshCw } from 'lucide-react';

function OrdersPage() {
  const { currentUser, orders, products, updateOrderStatus, deleteOrder } = useApp();
  const [editingStatusId, setEditingStatusId] = useState(null);
  
  // Customers see only their orders, admins/managers see all
  const userOrders = currentUser.role === 'CUSTOMER' 
    ? orders.filter(o => o.userId === currentUser.id)
    : orders;
  
  // Only admins and managers can modify orders
  const canModifyOrders = currentUser.role === 'MANAGEMENT' || currentUser.role === 'ADMIN';
  
  const statuses = ['PENDING', 'APPROVED', 'READY_FOR_DELIVERY', 'DELIVERED'];
  
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown Product';
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'PENDING':
        return <Clock size={18} />;
      case 'APPROVED':
        return <Check size={18} />;
      case 'READY_FOR_DELIVERY':
        return <Package size={18} />;
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
      case 'READY_FOR_DELIVERY':
        return 'status-ready';
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

  return (
    <div className="orders-page-container">
      <div className="orders-header">
        <div>
          <h2 className="page-title">
            {currentUser.role === 'CUSTOMER' ? 'My Orders' : 'All Orders'}
          </h2>
          <p className="page-subtitle">
            {userOrders.length} {userOrders.length === 1 ? 'order' : 'orders'} found
          </p>
        </div>
      </div>

      <div className="orders-list">
        {userOrders.length === 0 ? (
          <div className="empty-state">
            <Package size={64} className="empty-icon" />
            <p>No orders found.</p>
          </div>
        ) : (
          userOrders.map(order => (
            <div key={order.id} className="order-card">
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

              <div className="order-items">
                <h4 className="order-items-title">Order Items</h4>
                <div className="order-items-list">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="order-item">
                      <div className="order-item-info">
                        <span className="order-item-name">{getProductName(item.productId)}</span>
                        <span className="order-item-quantity">× {item.quantity}</span>
                      </div>
                      <span className="order-item-price">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {canModifyOrders && currentUser.role === 'ADMIN' && (
                <div className="order-actions">
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this order?')) {
                        deleteOrder(order.id);
                      }
                    }}
                    className="btn-order-action btn-delete-order"
                  >
                    <Trash2 size={16} />
                    <span>Delete Order</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default OrdersPage;