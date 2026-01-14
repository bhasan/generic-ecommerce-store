import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AnnouncementBanner from './components/common/AnnouncementBanner';
import Navbar from './components/layout/Navbar';
import Notification from './components/common/Notification';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import ProductsPage from './features/products/ProductsPage';
import ProductItemPage from './features/products/ProductItemPage';
import CartPage from './features/cart/CartPage';
import CheckoutPage from './features/cart/CheckoutPage';
import OrderSuccessPage from './features/cart/OrderSuccessPage';
import OrdersPage from './features/orders/OrdersPage';
import ManageProductsPage from './features/products/ManageProductsPage';
import ProfilePage from './features/profile/ProfilePage';
import DashboardPage from './features/dashboard/DashboardPage';
import UsersPage from './features/users/UsersPage';
import RejectedUsersPage from './features/users/RejectedUsersPage';
import DeliveryDriverDashboard from './features/delivery/DeliveryDriverDashboard';
import DeliveredOrdersPage from './features/orders/DeliveredOrdersPage';
import CategoriesPage from './features/categories/CategoriesPage';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-900">
        <AnnouncementBanner />
        <Navbar />
        <Notification />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* All routes below require login (no guest access) */}
            <Route path="/products" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <ProductsPage />
              </ProtectedRoute>
            } />
            <Route path="/products/:id" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <ProductItemPage />
              </ProtectedRoute>
            } />
            <Route path="/cart" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <CartPage />
              </ProtectedRoute>
            } />
            <Route path="/checkout" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <CheckoutPage />
              </ProtectedRoute>
            } />
            <Route path="/order-success" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <OrderSuccessPage />
              </ProtectedRoute>
            } />
            
            {/* Profile Route - Protected for logged in users only */}
            <Route path="/profile" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <ProfilePage />
              </ProtectedRoute>
            } />
            
            {/* Orders Route - Protected */}
            <Route path="/orders" element={
              <ProtectedRoute roles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
                <OrdersPage />
              </ProtectedRoute>
            } />
            
            {/* Admin/Manager Routes */}
            <Route path="/manage-products" element={
              <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                <ManageProductsPage />
              </ProtectedRoute>
            } />

            <Route path="/categories" element={
              <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                <CategoriesPage />
              </ProtectedRoute>
            } />

            {/* Dashboard - Admin/Manager only */}
            <Route path="/dashboard" element={
              <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                <DashboardPage />
              </ProtectedRoute>
            } />

            {/* Users Management - Admin only */}
            <Route path="/users" element={
              <ProtectedRoute roles={['ADMIN']}>
                <UsersPage />
              </ProtectedRoute>
            } />

            {/* Rejected Users - Admin only */}
            <Route path="/rejected-users" element={
              <ProtectedRoute roles={['ADMIN']}>
                <RejectedUsersPage />
              </ProtectedRoute>
            } />

            {/* Delivered Orders - Admin only */}
            <Route path="/delivered-orders" element={
              <ProtectedRoute roles={['ADMIN']}>
                <DeliveredOrdersPage />
              </ProtectedRoute>
            } />

            {/* Delivery Driver Dashboard - Admin, Management, Delivery Driver */}
            <Route path="/delivery-dashboard" element={
              <ProtectedRoute roles={['ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER']}>
                <DeliveryDriverDashboard />
              </ProtectedRoute>
            } />

            {/* Default Route - Redirect to login for unauthenticated users */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    </AppProvider>
  );
}

export default App;