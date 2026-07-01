import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import AnnouncementBanner from './components/common/AnnouncementBanner';
import OrderPickupNotice from './components/common/OrderPickupNotice';
import CustomerArrivedNotice from './components/common/CustomerArrivedNotice';
import Navbar from './components/layout/Navbar';
import Notification from './components/common/Notification';
import ErrorBoundary from './components/common/ErrorBoundary';
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
import PendingRegistrationsPage from './features/dashboard/pages/PendingRegistrationsPage';
import AnnouncementsPage from './features/dashboard/pages/AnnouncementsPage';
import MessagesPage from './features/dashboard/pages/MessagesPage';
import RejectedUsersPage from './features/dashboard/pages/RejectedUsersPage';
import UsersPage from './features/dashboard/pages/UsersPage';
import LandingPageSettingsPage from './features/dashboard/pages/LandingPageSettingsPage';
import VIPManagementPage from './features/dashboard/pages/VIPManagementPage';
import StoreCreditPage from './features/credits/StoreCreditPage';
import DeliveryDriverDashboard from './features/delivery/DeliveryDriverDashboard';
import OrderHistoryPage from './features/orders/OrderHistoryPage';
import WebsiteManagementPage from './features/website/WebsiteManagementPage';
import StoreIdentityPage from './features/website/pages/StoreIdentityPage';
import BrandColorsPage from './features/website/pages/BrandColorsPage';
import HeroImagePage from './features/website/pages/HeroImagePage';
import FaviconPage from './features/website/pages/FaviconPage';
import StoreInfoPage from './features/website/pages/StoreInfoPage';
import PaymentPage from './features/website/pages/PaymentPage';
import DeliveryPage from './features/website/pages/DeliveryPage';
// TEMPORARY: tenant management lives in website-management and is ADMIN-gated
// (inherits the parent /website-management ADMIN guard); it will move to a
// dedicated super-admin portal later.
import TenantsPage from './features/website/pages/TenantsPage';
import StoresPage from './features/website/pages/StoresPage';
import HelpPage from './features/help/HelpPage';
import LandingPage from './features/landing/LandingPage';
import ManageStorePage from './features/manage-store/ManageStorePage';
import ManageStoreProductsPage from './features/manage-store/pages/ManageStoreProductsPage';
import ManageStoreCategoriesPage from './features/manage-store/pages/ManageStoreCategoriesPage';
import ManageStoreMediaPage from './features/manage-store/pages/ManageStoreMediaPage';
import ManageStoreBulkPage from './features/manage-store/pages/ManageStoreBulkPage';
import StoreInventoryPage from './features/manage-store/pages/StoreInventoryPage';
import StorePicker from './features/store/StorePicker';

function App() {
  return (
    <ErrorBoundary>
<ScrollToTop />
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const location = useLocation();
  const isOrdersPage = location.pathname === '/orders' || location.pathname === '/delivery-dashboard';

  return (
    <div className="app-wrapper">
      <AnnouncementBanner />
      <OrderPickupNotice />
      <CustomerArrivedNotice />
      <Navbar />
      <StorePicker />
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

          {/* My Orders Route - Protected (All users can view their own orders) */}
          <Route path="/my-orders" element={
            <ProtectedRoute roles={[ROLES.CUSTOMER, ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]}>
              <OrdersPage forceCustomerView={true} />
            </ProtectedRoute>
          } />

          {/* Old manage-products redirect */}
          <Route path="/manage-products" element={<Navigate to="/manage-store/products" replace />} />

          {/* Manage Store - nested routes */}
          <Route path="/manage-store" element={
            <ProtectedRoute roles={[ROLES.MANAGEMENT, ROLES.ADMIN]}>
              <ManageStorePage />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="products" replace />} />
            <Route path="products" element={<ManageStoreProductsPage />} />
            <Route path="categories" element={<ManageStoreCategoriesPage />} />
            <Route path="media" element={<ManageStoreMediaPage />} />
            <Route path="bulk" element={<ManageStoreBulkPage />} />
            <Route path="inventory" element={
              <ProtectedRoute roles={[ROLES.ADMIN]}>
                <StoreInventoryPage />
              </ProtectedRoute>
            } />
          </Route>

          {/* Dashboard - Admin/Manager only */}
          <Route path="/dashboard" element={
            <ProtectedRoute roles={[ROLES.MANAGEMENT, ROLES.ADMIN]}>
              <DashboardPage />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="pending-registrations" replace />} />
            <Route path="pending-registrations" element={<PendingRegistrationsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="vip-management" element={<VIPManagementPage />} />
            <Route path="landing-page" element={<LandingPageSettingsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="rejected-users" element={<RejectedUsersPage />} />
          </Route>


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

          <Route path="/website-management" element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <WebsiteManagementPage />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="identity" replace />} />
            <Route path="identity" element={<StoreIdentityPage />} />
            <Route path="colors" element={<BrandColorsPage />} />
            <Route path="hero" element={<HeroImagePage />} />
            <Route path="favicon" element={<FaviconPage />} />
            <Route path="info" element={<StoreInfoPage />} />
            <Route path="payment" element={<PaymentPage />} />
            <Route path="delivery" element={<DeliveryPage />} />
            {/* Tenant management is a PLATFORM function — SUPER_ADMIN only, not per-tenant admins. */}
            <Route path="tenants" element={
              <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                <TenantsPage />
              </ProtectedRoute>
            } />
            {/* Store management — per-tenant-admin (ADMIN role, not SUPER_ADMIN). */}
            <Route path="stores" element={<StoresPage />} />
          </Route>

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
  );
}

export default App;
