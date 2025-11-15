import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import ProductsPage from './features/products/ProductsPage';
import CartPage from './features/cart/CartPage';
import OrdersPage from './features/orders/OrdersPage';
import ManageProductsPage from './features/products/ManageProductsPage';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/cart" element={<CartPage />} />
            
            {/* Customer Routes */}
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

            {/* Default Route */}
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Routes>
        </main>
      </div>
    </AppProvider>
  );
}

export default App;