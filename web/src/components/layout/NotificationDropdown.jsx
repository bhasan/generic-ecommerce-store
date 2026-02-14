import React, { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './NotificationDropdown.css';

const ORDER_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  NOT_FULFILLING: 'Not Fulfilling',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  OUT_FOR_DELIVERY: 'Out for Delivery'
};

function NotificationDropdown({ counts, canAccessDashboard }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const ordersByStatus = counts?.ordersByStatus ?? {};
  const pendingRegistrations = counts?.pendingRegistrations ?? 0;

  const orderEntries = Object.entries(ordersByStatus).filter(([, n]) => n > 0);
  const totalOrders = Object.values(ordersByStatus).reduce((a, b) => a + b, 0);
  const pendingRegsCount = canAccessDashboard ? pendingRegistrations : 0;
  const totalCount = totalOrders + pendingRegsCount;

  const handleOrderStatusClick = (status) => {
    setOpen(false);
    navigate(`/orders?status=${status}`);
  };

  const handlePendingRegistrationsClick = () => {
    setOpen(false);
    navigate('/dashboard?section=pending-registrations');
  };

  return (
    <div className="notification-dropdown" ref={ref}>
      <button
        type="button"
        className="notification-button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Staff notifications"
      >
        <Bell size={20} />
        {totalCount > 0 && <span className="notification-badge">{totalCount}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">Notifications</div>
          {totalCount === 0 ? (
            <div className="notification-empty">No notifications</div>
          ) : (
          <>
          {orderEntries.map(([status, count]) => (
            <button
              key={status}
              type="button"
              className="notification-item"
              onClick={() => handleOrderStatusClick(status)}
            >
              <span className="notification-item-label">
                {ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
              </span>
              <span className="notification-item-count">{count}</span>
            </button>
          ))}
          {pendingRegistrations > 0 && canAccessDashboard && (
            <button
              type="button"
              className="notification-item"
              onClick={handlePendingRegistrationsClick}
            >
              <span className="notification-item-label">Pending Registrations</span>
              <span className="notification-item-count">{pendingRegistrations}</span>
            </button>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;
