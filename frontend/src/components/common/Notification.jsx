import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

function Notification() {
  const { notification, closeNotification } = useApp();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        closeNotification();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notification, closeNotification]);

  if (!notification) return null;

  const icons = {
    success: <CheckCircle size={20} />,
    info: <Info size={20} />,
    warning: <AlertTriangle size={20} />
  };

  return (
    <div className="notification-container">
      <div className={`notification notification-${notification.type}`}>
        <div className="notification-icon">
          {icons[notification.type] || icons.info}
        </div>
        <div className="notification-content">
          <p className="notification-message">{notification.message}</p>
          {notification.action && (
            <button 
              onClick={notification.action.onClick}
              className="notification-action-btn"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        <button 
          onClick={closeNotification}
          className="notification-close"
          aria-label="Close notification"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

export default Notification;