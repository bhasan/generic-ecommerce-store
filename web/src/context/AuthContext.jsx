// web/src/context/AuthContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
import * as ordersApi from '../services/ordersApi';
import * as creditApi from '../services/storeCreditApi';
import { getAuthToken, newSession } from '../services/api';
import { GUEST_USER, ROLES } from '../utils/roles';
import { useUIContext } from './UIContext';

const AuthContext = createContext(null);

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  const { showNotification, returnPath, setReturnPath } = useUIContext();
  const navigate = useNavigate();

  const getInitialUser = () => {
    const stored = localStorage.getItem('userData');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (!user.roles && user.role) user.roles = [user.role];
        return user;
      } catch { /* fall through */ }
    }
    return GUEST_USER;
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // The access token lives in memory only, so it is always empty on a
        // fresh load. Mint one from the httpOnly refresh cookie (if the user
        // has a live session); otherwise fall through as a guest.
        let token = getAuthToken();
        if (!token) {
          try {
            await authApi.refresh();
            token = getAuthToken();
          } catch { /* no/expired cookie — fall through as unauthenticated */ }
        }

        if (token) {
          try {
            const user = await authApi.getProfile();
            if (!user.roles && user.role) user.roles = [user.role];
            setCurrentUser(user);
            setIsAuthenticated(true);
            newSession();
            try {
              const creditData = await creditApi.getUserCredit(user.id);
              setCreditBalance(creditData.balance ?? 0);
            } catch { /* non-fatal */ }
          } catch {
            setCurrentUser(GUEST_USER);
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Handle global auth:unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setReturnPath(null);
      // Drop the prior session's store selection so the next principal on this
      // browser doesn't inherit it (wrong catalog/pricing; a stale 0 → checkout 400s).
      localStorage.removeItem('selectedStoreId');
      navigate('/login');
      showNotification('Your session has expired. Please log in again.', 'warning');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [navigate, showNotification, setReturnPath]);

  const login = async (username, password) => {
    try {
      const { user } = await authApi.login(username, password);
      if (!user.roles && user.role) user.roles = [user.role];
      setCurrentUser(user);
      setIsAuthenticated(true);
      newSession();
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        const roles = user.roles || [];
        if (roles.includes(ROLES.DELIVERY_DRIVER) && !roles.includes(ROLES.MANAGEMENT) && !roles.includes(ROLES.ADMIN)) {
          navigate('/delivery-dashboard');
        } else if (roles.includes(ROLES.CUSTOMER) && !roles.some(r => [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER].includes(r))) {
          navigate('/products');
        } else {
          navigate('/orders');
        }
      }
      showNotification('Login successful!', 'success');
      return true;
    } catch (error) {
      showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
      return false;
    }
  };

  const register = async (data) => {
    try {
      const response = await authApi.register(data);
      const message = response.message || 'Registration successful! Please visit the store to get approved.';
      showNotification(message, 'success');
      return { success: true, message };
    } catch (error) {
      showNotification(error.message || 'Registration failed. Please try again.', 'error');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch { /* local logout always proceeds */ }
    finally {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setCreditBalance(0);
      setReturnPath(null);
      // Clear store selection too: the next session must start fresh (single-store
      // auto-selects, multi-store shows the picker, admin re-picks All-stores).
      localStorage.removeItem('selectedStoreId');
      navigate('/products');
      showNotification('You have been logged out', 'info');
    }
  };

  const updateUserProfile = async (updates) => {
    try {
      const updatedUser = await usersApi.updateUser(currentUser.id, updates);
      if (!updatedUser.roles && updatedUser.role) updatedUser.roles = [updatedUser.role];
      setCurrentUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      showNotification('Profile updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update profile. Please try again.', 'error');
      throw error;
    }
  };

  const refreshCreditBalance = useCallback(async (userId) => {
    try {
      const creditData = await creditApi.getUserCredit(userId);
      setCreditBalance(creditData.balance ?? 0);
    } catch { /* non-fatal */ }
  }, []);

  const checkDeliveryEligibility = useCallback(async (deliveryAddress) => {
    return ordersApi.checkDeliveryEligibility(deliveryAddress);
  }, []);

  return (
    <AuthContext.Provider value={{
      currentUser, setCurrentUser, isAuthenticated, setIsAuthenticated,
      isLoading, login, logout, register, updateUserProfile,
      creditBalance, setCreditBalance, refreshCreditBalance, checkDeliveryEligibility,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
