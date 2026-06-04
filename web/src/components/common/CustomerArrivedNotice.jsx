import React, { useState, useEffect } from 'react';
import { X, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { hasRole, ROLES } from '../../utils/roles';
import './CustomerArrivedNotice.css';

const CustomerArrivedNotice = () => {
  const { orders, currentUser, isAuthenticated } = useApp();
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(
    () => sessionStorage.getItem('customerArrivedNoticeMuted') === 'true'
  );

  const isStaff = isAuthenticated && (
    hasRole(currentUser, ROLES.EMPLOYEE) ||
    hasRole(currentUser, ROLES.MANAGEMENT) ||
    hasRole(currentUser, ROLES.ADMIN)
  );

  // Check if there are any orders where customer has arrived
  const arrivedOrders = orders && orders.filter(order => order.status === 'ARRIVED');
  const hasArrivedOrders = arrivedOrders && arrivedOrders.length > 0;

  // Reset mute if the number of arrived orders increases (so new arrivals trigger it again)
  const arrivedOrdersCount = arrivedOrders ? arrivedOrders.length : 0;
  const [prevCount, setPrevCount] = useState(arrivedOrdersCount);

  useEffect(() => {
    if (arrivedOrdersCount > prevCount) {
      setIsMuted(false);
      sessionStorage.removeItem('customerArrivedNoticeMuted');
    }
    setPrevCount(arrivedOrdersCount);
  }, [arrivedOrdersCount, prevCount]);

  const handleClose = (e) => {
    e.stopPropagation();
    setIsMuted(true);
    sessionStorage.setItem('customerArrivedNoticeMuted', 'true');
  };

  const handleClick = () => {
    navigate('/orders?status=ARRIVED');
  };

  if (!isStaff || !hasArrivedOrders || isMuted) {
    return null;
  }

  const customerNames = Array.from(new Set(arrivedOrders.map(o => o.user?.username || 'Customer'))).join(', ');

  return (
    <div className="customer-arrived-notice" onClick={handleClick} role="button" aria-label="View arrived customers">
      <div className="customer-arrived-notice-content">
        <span className="customer-arrived-notice-icon">
          <Bell size={18} />
        </span>
        <span>
          {arrivedOrders.length === 1 
            ? `Customer ${customerNames} has arrived for pickup!`
            : `${arrivedOrders.length} customers (${customerNames}) have arrived for pickup!`
          }
        </span>
      </div>
      <button 
        className="customer-arrived-notice-btn"
        onClick={(e) => {
          e.stopPropagation();
          navigate('/orders?status=ARRIVED');
        }}
      >
        View Orders
      </button>
      <button 
        className="customer-arrived-notice-close"
        onClick={handleClose}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default CustomerArrivedNotice;
