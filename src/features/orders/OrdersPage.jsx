import React from 'react';
import { useApp } from '../../context/AppContext';
import { Check, Trash2, Package, Clock, Truck, CheckCircle } from 'lucide-react';

function OrdersPage() {
  const { currentUser, orders, products, updateOrderStatus, deleteOrder } = useApp();
  const userOrders = currentUser.role === 'CUSTOMER' 
    ? orders.filter(o => o.userId === currentUser.id)
    : orders;
  
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
                <div className={`order-status ${getStatusClass(order.status)}`}>
                  {getStatusIcon(order.status)}
                  <span>{order.status.replace(/_/g, ' ')}</span>
                </div>
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

              {(currentUser.role === 'MANAGEMENT' || currentUser.role === 'ADMIN') && (
                <div className="order-actions">
                  {order.status === 'PENDING' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'APPROVED')}
                      className="btn-order-action btn-approve"
                    >
                      <Check size={16} />
                      <span>Approve Payment</span>
                    </button>
                  )}
                  {order.status === 'APPROVED' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'READY_FOR_DELIVERY')}
                      className="btn-order-action btn-ready"
                    >
                      <Package size={16} />
                      <span>Mark Ready for Delivery</span>
                    </button>
                  )}
                  {order.status === 'READY_FOR_DELIVERY' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'DELIVERED')}
                      className="btn-order-action btn-deliver"
                    >
                      <Truck size={16} />
                      <span>Mark as Delivered</span>
                    </button>
                  )}
                  {currentUser.role === 'ADMIN' && (
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
                  )}
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