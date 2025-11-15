import React from 'react';
import { useApp } from '../../context/AppContext';
import { Check, Trash2 } from 'lucide-react';

function OrdersPage() {
  const { currentUser, orders, products, updateOrderStatus, deleteOrder } = useApp();
  const userOrders = currentUser.role === 'CUSTOMER' 
    ? orders.filter(o => o.userId === currentUser.id)
    : orders;
  
  // ... (rest of your OrdersPage logic and JSX)
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown Product';
  };

  const statusColors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    READY_FOR_DELIVERY: 'bg-purple-100 text-purple-800',
    DELIVERED: 'bg-green-100 text-green-800'
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-white">
        {currentUser.role === 'CUSTOMER' ? 'My Orders' : 'All Orders'}
      </h2>
      <div className="space-y-4">
        {userOrders.map(order => (
          <div key={order.id} className="bg-gray-800 rounded-lg shadow-md p-6 border border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Order #{order.id}</h3>
                <p className="text-gray-400">Date: {order.createdAt}</p>
                <p className="text-gray-400">Total: ${order.total.toFixed(2)}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[order.status]}`}>
                {order.status.replace('_', ' ')}
              </span>
            </div>
            <div className="mb-4">
              <h4 className="font-semibold mb-2 text-white">Items:</h4>
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-gray-400">
                  <span>{getProductName(item.productId)} x{item.quantity}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {(currentUser.role === 'MANAGEMENT' || currentUser.role === 'ADMIN') && (
              <div className="flex space-x-2">
                {order.status === 'PENDING' && (
                  <button
                    onClick={() => updateOrderStatus(order.id, 'APPROVED')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center space-x-1"
                  >
                    <Check size={16} />
                    <span>Approve Payment</span>
                  </button>
                )}
                {order.status === 'APPROVED' && (
                  <button
                    onClick={() => updateOrderStatus(order.id, 'READY_FOR_DELIVERY')}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
                  >
                    Mark Ready for Delivery
                  </button>
                )}
                {order.status === 'READY_FOR_DELIVERY' && (
                  <button
                    onClick={() => updateOrderStatus(order.id, 'DELIVERED')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                  >
                    Mark as Delivered
                  </button>
                )}
                {currentUser.role === 'ADMIN' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this order?')) {
                        deleteOrder(order.id);
                      }
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center space-x-1"
                  >
                    <Trash2 size={16} />
                    <span>Delete Order</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default OrdersPage;