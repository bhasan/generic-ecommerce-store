import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest } from '../../utils/roles';

function ProtectedRoute({ children, roles }) {
  const { currentUser, setReturnPath } = useApp();
  const location = useLocation();

  // Check if user is a guest
  const isGuest = checkIsGuest(currentUser);

  useEffect(() => {
    // If guest tries to access protected route, save the path they wanted
    if (isGuest) {
      setReturnPath(location.pathname);
    }
  }, [isGuest, location.pathname, setReturnPath]);

  // If guest tries to access protected route, redirect to login
  if (isGuest) {
    return <Navigate to="/login" replace />;
  }

  // If no current user, redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  // If roles specified and user doesn't have permission
  if (roles) {
    // Support both old format (single role) and new format (roles array)
    const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
    const hasRequiredRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      return <Navigate to="/products" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;