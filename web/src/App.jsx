import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AnnouncementBanner from './components/common/AnnouncementBanner';
import Navbar from './components/layout/Navbar';
import Notification from './components/common/Notification';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import ProductsPage from './features/products/ProductsPage';
import ProductItemPage from './features/products/ProductItemPage';
import CartPage from './features/cart/CartPage';
import OrdersPage from './features/orders/OrdersPage';
import ManageProductsPage from './features/products/ManageProductsPage';
import ProfilePage from './features/profile/ProfilePage';
import DashboardPage from './features/dashboard/DashboardPage';

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
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductItemPage />} />
            <Route path="/cart" element={<CartPage />} />
            
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

            {/* Dashboard - Admin/Manager only */}
            <Route path="/dashboard" element={
              <ProtectedRoute roles={['MANAGEMENT', 'ADMIN']}>
                <DashboardPage />
              </ProtectedRoute>
            } />

            {/* Default Route */}
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Routes>
        </main>
      </div>
    </AppProvider>
  );
}

export default App;