import React, { useState, useEffect } from 'react';
import { Package, X, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './OrderPickupNotice.css';

const OrderPickupNotice = () => {
  const { orders, isAuthenticated } = useApp();
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(
    () => sessionStorage.getItem('pickupNoticeMuted') === 'true'
  );

  // Check if there are any orders ready for pickup
  const hasReadyOrders = orders && orders.some(order => order.status === 'READY_FOR_PICKUP');

  const handleClose = (e) => {
    e.stopPropagation();
    setIsMuted(true);
    sessionStorage.setItem('pickupNoticeMuted', 'true');
  };

  const handleClick = () => {
    navigate('/orders');
  };

  if (!isAuthenticated || !hasReadyOrders || isMuted) {
    return null;
  }

  return (
    <div className="order-pickup-notice" onClick={handleClick} role="button" aria-label="View ready orders">
      <div className="order-pickup-notice-content">
        <span className="order-pickup-notice-icon">
          <Bell size={18} />
        </span>
        <span>One or more of your orders are ready for pickup!</span>
      </div>
      <button 
        className="order-pickup-notice-btn"
        onClick={(e) => {
          e.stopPropagation();
          navigate('/orders');
        }}
      >
        View Orders
      </button>
      <button 
        className="order-pickup-notice-close"
        onClick={handleClose}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default OrderPickupNotice;
