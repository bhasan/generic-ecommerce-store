import React, { useState, useRef, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './NotificationDropdown.css';

const ORDER_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  NOT_FULFILLING: 'Not Fulfilling',
  READY_FOR_DELIVERY: 'Ready for Delivery',
  OUT_FOR_DELIVERY: 'Out for Delivery'
};

function NotificationDropdown({
  counts,
  canAccessDashboard,
  notifications = [],
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  notificationsMuted,
  onToggleMuted,
  canManageOrders,
}) {
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
  const staffTotalCount = canManageOrders ? totalOrders + pendingRegsCount : 0;
  const totalCount = unreadCount + staffTotalCount;

  const handleNavigate = async (path, notificationId) => {
    setOpen(false);
    if (notificationId && onMarkRead) {
      await onMarkRead(notificationId);
    }
    navigate(path);
  };

  const resolveNotificationPath = (item) => {
    const path = item.metadata?.path;
    if (typeof path === 'string' && path) {
      return path;
    }

    if (item.sourceEntityType === 'ORDER') {
      return '/orders';
    }

    if (item.sourceEntityType === 'CONTACT_MESSAGE') {
      return '/help';
    }

    return '/products';
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
        aria-label="Notifications"
      >
        <Bell size={20} />
        {totalCount > 0 && <span className="notification-badge">{totalCount}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header-row">
            <div className="notification-panel-header">Notifications</div>
            <div className="notification-panel-actions">
              <button type="button" className="notification-utility" onClick={onToggleMuted} aria-label="Toggle staff sound alerts">
                {notificationsMuted ? <BellOff size={16} /> : <Bell size={16} />}
              </button>
              {unreadCount > 0 && (
                <button type="button" className="notification-utility-text" onClick={onMarkAllRead}>
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 && staffTotalCount === 0 ? (
            <div className="notification-empty">No notifications</div>
          ) : (
            <>
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-item notification-item-inbox ${!item.readAt ? 'notification-item-unread' : ''}`}
                  onClick={() => handleNavigate(resolveNotificationPath(item), item.id)}
                >
                  <span className="notification-item-main">
                    {item.requiresAttention && !item.readAt && <span className="notification-item-dot" />}
                    <span className="notification-item-copy">
                      <span className="notification-item-title">{item.title}</span>
                      <span className="notification-item-message">{item.message}</span>
                    </span>
                  </span>
                </button>
              ))}

              {orderEntries.map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  className="notification-item"
                  onClick={() => handleNavigate(`/orders?status=${status}`)}
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
                  onClick={() => handleNavigate('/dashboard?section=pending-registrations')}
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
