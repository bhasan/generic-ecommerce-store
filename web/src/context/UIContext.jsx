import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { toNotificationMessage } from '../utils/notificationMessage';

const UIContext = createContext(null);

export const useUIContext = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within UIProvider');
  return ctx;
};

export function UIProvider({ children }) {
  const [notification, setNotification] = useState(null);
  const [returnPath, setReturnPath] = useState(null);

  const showNotification = useCallback((message, type = 'success', action = null) => {
    const safeMessage = toNotificationMessage(message, 'Something went wrong. Please try again.');
    setNotification({ message: safeMessage, type, action });
  }, []);

  const closeNotification = useCallback(() => setNotification(null), []);

  // backend:unavailable is a global event fired by the API layer when the server can't be reached
  useEffect(() => {
    const handleBackendUnavailable = (event) => {
      const message = event?.detail?.message || 'We are having trouble reaching the server. Please try again shortly.';
      showNotification(message, 'warning', { label: 'Reload', onClick: () => window.location.reload() });
    };
    window.addEventListener('backend:unavailable', handleBackendUnavailable);
    return () => window.removeEventListener('backend:unavailable', handleBackendUnavailable);
  }, [showNotification]);

  return (
    <UIContext.Provider value={{ notification, showNotification, closeNotification, returnPath, setReturnPath }}>
      {children}
    </UIContext.Provider>
  );
}
