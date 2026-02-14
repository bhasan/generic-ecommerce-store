import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AnnouncementBanner from './components/common/AnnouncementBanner';
import Navbar from './components/layout/Navbar';
import Notification from './components/common/Notification';
import ErrorBoundary from './components/common/ErrorBoundary';
import TawkToWidget from './components/common/TawkToWidget';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import ProductsPage from './features/products/ProductsPage';
import ProductItemPage from './features/products/ProductItemPage';
import CartPage from './features/cart/CartPage';
import CheckoutPage from './features/cart/CheckoutPage';
import OrderSuccessPage from './features/cart/OrderSuccessPage';
import OrdersPage from './features/orders/OrdersPage';
import ProfilePage from './features/profile/ProfilePage';
import DashboardPage from './features/dashboard/DashboardPage';
import DeliveryDriverDashboard from './features/delivery/DeliveryDriverDashboard';
import OrderHistoryPage from './features/orders/OrderHistoryPage';
import HelpPage from './features/help/HelpPage';

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <TawkToWidget />
        <div className="app-wrapper">
          <AnnouncementBanner />
          <Navbar />
          <Notification />
          <main className="container main-content">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              
              {/* All routes below require login (no guest access) */}
              <Route path="/products" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <ProductsPage />
                </ProtectedRoute>
              } />
              <Route path="/products/:id" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <ProductItemPage />
                </ProtectedRoute>
              } />
              <Route path="/cart" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <CartPage />
                </ProtectedRoute>
              } />
              <Route path="/checkout" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <CheckoutPage />
                </ProtectedRoute>
              } />
              <Route path="/order-success" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <OrderSuccessPage />
                </ProtectedRoute>
              } />
              
              {/* Profile Route - Protected for logged in users only */}
              <Route path="/profile" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              
              {/* Orders Route - Protected (Employees can manage orders) */}
              <Route path="/orders" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN']}>
                  <OrdersPage />
                </ProtectedRoute>
              } />
              
              {/* Admin/Manager Routes */}
              <Route path="/manage-products" element={
                <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                  <ProductsPage mode="manage" />
                </ProtectedRoute>
              } />

              {/* Dashboard - Admin/Manager only */}
              <Route path="/dashboard" element={
                <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                  <DashboardPage />
                </ProtectedRoute>
              } />


              {/* Order History - Admin only */}
              <Route path="/order-history" element={
                <ProtectedRoute roles={['ADMIN']}>
                  <OrderHistoryPage />
                </ProtectedRoute>
              } />

              {/* Delivery Driver Dashboard - Admin, Management, Delivery Driver */}
              <Route path="/delivery-dashboard" element={
                <ProtectedRoute roles={['ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER']}>
                  <DeliveryDriverDashboard />
                </ProtectedRoute>
              } />

              {/* Help Page - All authenticated users */}
              <Route path="/help" element={
                <ProtectedRoute roles={['CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER']}>
                  <HelpPage />
                </ProtectedRoute>
              } />

              {/* Default Route - Redirect to login for unauthenticated users */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </main>
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;