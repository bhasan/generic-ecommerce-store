import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

function ProtectedRoute({ children, roles }) {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (roles && !roles.includes(currentUser.role)) {
    // User is logged in but doesn't have permission
    return <Navigate to="/products" replace />;
  }

  return children;
}

export default ProtectedRoute;