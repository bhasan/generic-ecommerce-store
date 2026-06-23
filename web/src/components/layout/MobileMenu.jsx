import React from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Tag, Home, Truck, HelpCircle } from 'lucide-react';
import AdminDropdown from './AdminDropdown';

function MobileMenu({
  isGuest,
  isCustomer,
  isDeliveryDriver,
  isManagement,
  isAdmin,
  canManageOrders,
  hasArrivedOrders,
}) {
  return (
    <>
      {!isGuest && (
        <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} end>
          <Home size={18} /><span>Welcome</span>
        </NavLink>
      )}
      {!isGuest && (
        <NavLink to="/products" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Package size={18} /><span>Products</span>
        </NavLink>
      )}
      {(isDeliveryDriver || isManagement) && (
        <NavLink to="/delivery-dashboard" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Truck size={18} /><span>Delivery</span>
        </NavLink>
      )}
      {isCustomer && !isGuest && (
        <NavLink to="/my-orders" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Package size={18} /><span>My Orders</span>
        </NavLink>
      )}
      {canManageOrders && (
        <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Package size={18} /><span>Orders</span>
          {hasArrivedOrders && <span className="nav-dot" aria-label="Customer arrived notification" />}
        </NavLink>
      )}
      {canManageOrders && (
        <NavLink to="/my-orders" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <Package size={18} /><span>My Orders</span>
        </NavLink>
      )}
      {isManagement && (
        <NavLink to="/manage-products" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} title="Manage Products">
          <Tag size={18} /><span>Manage Products</span>
        </NavLink>
      )}
      {isManagement && <AdminDropdown isAdmin={isAdmin} variant="mobile" />}
      {!isGuest && (
        <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
          <HelpCircle size={18} /><span>Help &amp; Support</span>
        </NavLink>
      )}
    </>
  );
}

export default MobileMenu;
