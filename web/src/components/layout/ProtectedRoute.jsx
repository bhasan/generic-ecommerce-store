import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest, getUserRoles } from '../../utils/roles';

function ProtectedRoute({ children, roles }) {
  const { currentUser, isLoading, setReturnPath } = useApp();
  const location = useLocation();

  const isGuest = checkIsGuest(currentUser);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (isGuest) {
      setReturnPath(location.pathname);
    }
  }, [isGuest, isLoading, location.pathname, setReturnPath]);

  // Wait for auth bootstrap before redirecting so a saved session can keep its
  // initial route instead of bouncing through /login on first load.
  if (isLoading) {
    return null;
  }

  if (isGuest) {
    return <Navigate to="/login" replace />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (roles) {
    // Use the shared helper so ProtectedRoute stays compatible with both the
    // legacy role field and the newer roles array/user-role normalization path.
    const userRoles = getUserRoles(currentUser);
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return <Navigate to="/products" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
