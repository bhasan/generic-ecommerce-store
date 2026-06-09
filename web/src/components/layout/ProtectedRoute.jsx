import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest, getUserRoles } from '../../utils/roles';

function ProtectedRoute({ children, roles }) {
  const { currentUser, setReturnPath, isLoading } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const isGuest = checkIsGuest(currentUser);

  useEffect(() => {
    if (!isLoading) {
      if (isGuest || !currentUser) {
        setReturnPath(location.pathname);
        navigate('/login', { replace: true });
      } else if (roles) {
        const userRoles = getUserRoles(currentUser);
        const hasRequiredRole = roles.some(role => userRoles.includes(role));
        if (!hasRequiredRole) {
          navigate('/products', { replace: true });
        }
      }
    }
  }, [isLoading, isGuest, currentUser, roles, navigate, setReturnPath, location.pathname]);

  if (isLoading) {
    return (
      <div className="loading-indicator-placeholder" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    );
  }

  if (isGuest || !currentUser) {
    return null;
  }

  if (roles) {
    const userRoles = getUserRoles(currentUser);
    const hasRequiredRole = roles.some(role => userRoles.includes(role));
    if (!hasRequiredRole) {
      return null;
    }
  }

  return children;
}

export default ProtectedRoute;
