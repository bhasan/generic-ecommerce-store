import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import { AppProvider } from './context/AppContext';
import AnnouncementBanner from './components/common/AnnouncementBanner';
import OrderPickupNotice from './components/common/OrderPickupNotice';
import Navbar from './components/layout/Navbar';
import Notification from './components/common/Notification';
import ErrorBoundary from './components/common/ErrorBoundary';
import TawkToWidget from './components/common/TawkToWidget';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { ROLES } from './utils/roles';
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
import StoreCreditPage from './features/credits/StoreCreditPage';
import DeliveryDriverDashboard from './features/delivery/DeliveryDriverDashboard';
import OrderHistoryPage from './features/orders/OrderHistoryPage';
import HelpPage from './features/help/HelpPage';
import LandingPage from './features/landing/LandingPage';

function App() {
  const location = useLocation();
  const isOrdersPage = location.pathname === '/orders' || location.pathname === '/delivery-dashboard';

  return (
    <ErrorBoundary>
      <AppProvider>
        <TawkToWidget />
        <ScrollToTop />
        <div className="app-wrapper">
          <AnnouncementBanner />
          <OrderPickupNotice />
          <Navbar />
          <Notification />
          <main className={isOrdersPage ? 'full-width-layout main-content' : 'container main-content'}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Landing page — default home for authenticated users */}
              <Route path="/" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <LandingPage />
                </ProtectedRoute>
              } />
              
              {/* All routes below require login (no guest access) */}
              <Route path="/products" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <ProductsPage />
                </ProtectedRoute>
              } />
              <Route path="/products/:id" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <ProductItemPage />
                </ProtectedRoute>
              } />
              <Route path="/cart" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <CartPage />
                </ProtectedRoute>
              } />
              <Route path="/checkout" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <CheckoutPage />
                </ProtectedRoute>
              } />
              <Route path="/order-success" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <OrderSuccessPage />
                </ProtectedRoute>
              } />

              {/* Profile Route - Protected for logged in users only */}
              <Route path="/profile" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <ProfilePage />
                </ProtectedRoute>
              } />

              {/* Orders Route - Protected (Employees can manage orders) */}
              <Route path="/orders" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <OrdersPage />
                </ProtectedRoute>
              } />

              {/* Admin/Manager Routes */}
              <Route path="/manage-products" element={
                <ProtectedRoute roles={[ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <ProductsPage mode="manage" />
                </ProtectedRoute>
              } />

              {/* Dashboard - Admin/Manager only */}
              <Route path="/dashboard" element={
                <ProtectedRoute roles={[ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <DashboardPage />
                </ProtectedRoute>
              } />


              {/* Store Credit - Admin/Manager only */}
              <Route path="/store-credit" element={
                <ProtectedRoute roles={[ROLES.MANAGEMENT, ROLES.ADMIN]}>
                  <StoreCreditPage />
                </ProtectedRoute>
              } />

              {/* Order History - Admin only */}
              <Route path="/order-history" element={
                <ProtectedRoute roles={[ROLES.ADMIN]}>
                  <OrderHistoryPage />
                </ProtectedRoute>
              } />

              {/* Delivery Driver Dashboard - Admin, Management, Delivery Driver */}
              <Route path="/delivery-dashboard" element={
                <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.DELIVERY_DRIVER]}>
                  <DeliveryDriverDashboard />
                </ProtectedRoute>
              } />

              {/* Help Page - All authenticated users */}
              <Route path="/help" element={
                <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER]}>
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