import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Package, Users, User, LogOut, Settings, ChevronDown, LayoutDashboard, Truck, CheckCircle, HelpCircle, MessageSquare } from 'lucide-react';
import CartPreview from '../cart/CartPreview';
import NotificationDropdown from './NotificationDropdown';
import { hasRole } from '../../utils/roles';
import * as contactMessagesApi from '../../services/contactMessagesApi';

function Navbar() {
  const { currentUser, cart, logout, staffNotificationCounts } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const profileRef = useRef(null);
  const adminRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cart.length;
  const isGuest = currentUser.email === 'guest@smokestation.com';

  const isCustomer = hasRole(currentUser, 'CUSTOMER')
    && !hasRole(currentUser, 'EMPLOYEE')
    && !hasRole(currentUser, 'MANAGEMENT')
    && !hasRole(currentUser, 'ADMIN')
    && !hasRole(currentUser, 'DELIVERY_DRIVER');
  const isEmployee = hasRole(currentUser, 'EMPLOYEE');
  const isManagement = hasRole(currentUser, 'MANAGEMENT') || hasRole(currentUser, 'ADMIN');
  const isAdmin = hasRole(currentUser, 'ADMIN');
  const isDeliveryDriver = hasRole(currentUser, 'DELIVERY_DRIVER');
  // Can manage orders: employees, managers, and admins
  const canManageOrders = isEmployee || isManagement;

  useEffect(() => {
    function handleClickOutside(event) {
      // Check profile menu
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      // Check admin menu - close if clicking outside
      if (adminRef.current && !adminRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Close menus when route changes
  useEffect(() => {
    setShowAdminMenu(false);
    setShowMobileMenu(false);
  }, [location.pathname]);

  // Fetch new message count for admins/managers
  useEffect(() => {
    const fetchMessageCount = async () => {
      if (!isManagement || isGuest) return;
      
      try {
        const { count } = await contactMessagesApi.getNewMessageCount();
        setNewMessageCount(count);
      } catch (error) {
        // Silently fail - don't show error for badge count
        console.warn('Failed to fetch message count:', error);
      }
    };

    fetchMessageCount();
    
    // Refresh count every 60 seconds
    const interval = setInterval(fetchMessageCount, 60000);
    
    return () => clearInterval(interval);
  }, [isManagement, isGuest]);

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
  };

  // Render navigation links (reusable for both desktop and mobile)
  const renderNavLinks = () => (
    <>
      {/* Products page - accessible to ALL users including admins/managers */}
      <NavLink 
        to="/products" 
        className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
      >
        <Package size={18} />
        <span>Products</span>
      </NavLink>

      {/* Delivery link */}
      {(isDeliveryDriver || isManagement) && (
        <NavLink 
          to="/delivery-dashboard" 
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Truck size={18} />
          <span>Delivery</span>
        </NavLink>
      )}

      {/* Customer-specific links */}
      {isCustomer && !isGuest && (
        <NavLink 
          to="/orders" 
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Package size={18} />
          <span>My Orders</span>
        </NavLink>
      )}

      {/* Employee/Manager/Admin - Orders */}
      {canManageOrders && (
        <NavLink 
          to="/orders" 
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Package size={18} />
          <span>Orders</span>
        </NavLink>
      )}

      {/* Manager/Admin only - Manage Products */}
      {isManagement && (
        <NavLink 
          to="/manage-products" 
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Users size={18} />
          <span>Manage Products</span>
        </NavLink>
      )}

      {/* Management dropdown menu (for both managers and admins) */}
      {isManagement && (
        <div 
          className="admin-dropdown" 
          ref={adminRef}
        >
          <button
            className={`nav-link ${(location.pathname === '/dashboard' || location.pathname === '/users' || location.pathname === '/rejected-users' || location.pathname === '/delivered-orders') ? 'nav-link-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowAdminMenu(!showAdminMenu);
            }}
            aria-label="Management menu"
          >
            <Settings size={18} />
            <span>{isAdmin ? 'Admin' : 'Manager'}</span>
            <ChevronDown size={16} className={`admin-chevron ${showAdminMenu ? 'admin-chevron-open' : ''}`} />
          </button>

          {showAdminMenu && (
            <div className="admin-menu">
              <button
                type="button"
                onClick={() => {
                  navigate('/dashboard');
                  setShowAdminMenu(false);
                  setShowMobileMenu(false);
                }}
                className={`admin-menu-item ${location.pathname === '/dashboard' ? 'admin-menu-item-active' : ''}`}
              >
                <LayoutDashboard size={16} />
                <span>Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/delivered-orders');
                  setShowAdminMenu(false);
                  setShowMobileMenu(false);
                }}
                className={`admin-menu-item ${location.pathname === '/delivered-orders' ? 'admin-menu-item-active' : ''}`}
              >
                <CheckCircle size={16} />
                <span>Delivered Orders</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-left">
            <Link to="/products" className="navbar-brand">
              <span>Smoke Station HTX</span>
            </Link>
            
            {/* Desktop Navigation Links */}
            <div className="navbar-links">
              {renderNavLinks()}
            </div>
          </div>

          <div className="navbar-right">
            {/* Hamburger Menu Button (mobile only) */}
            <button 
              className={`hamburger-btn ${showMobileMenu ? 'open' : ''}`}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Toggle menu"
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>

            {canManageOrders && (
              <NotificationDropdown counts={staffNotificationCounts} canAccessDashboard={isManagement} />
            )}
            <CartPreview cart={cart} cartCount={cartCount} />
            
            {isGuest ? (
              <Link to="/login" className="btn-login-nav">
                Login
              </Link>
            ) : (
              <div className="profile-dropdown" ref={profileRef}>
                <button 
                  className="profile-button"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  aria-label="User menu"
                >
                  <User size={20} />
                  <span className="profile-name">{currentUser.name}</span>
                </button>

                {showProfileMenu && (
                  <div className="profile-menu surface-card-accent">
                    <div className="profile-menu-header">
                      <p className="profile-menu-name">{currentUser.name}</p>
                      <p className="profile-menu-email">{currentUser.email}</p>
                    </div>
                    <div className="profile-menu-divider"></div>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/profile');
                      }}
                      className="profile-menu-item"
                    >
                      <Settings size={16} />
                      <span>Change Profile</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="profile-menu-item profile-menu-logout"
                    >
                      <LogOut size={16} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Help link - right side, after profile */}
            <NavLink 
              to="/help" 
              className={({ isActive }) => `nav-link-icon ${isActive ? 'nav-link-icon-active' : ''}`}
              title="Help & Support"
            >
              <HelpCircle size={20} />
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div 
          className="mobile-menu-overlay open"
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      {/* Mobile Menu */}
      <div 
        className={`mobile-menu ${showMobileMenu ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {renderNavLinks()}
        
        {/* Help link in mobile menu */}
        {!isGuest && (
          <NavLink 
            to="/help" 
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <HelpCircle size={18} />
            <span>Help & Support</span>
          </NavLink>
        )}
      </div>
    </>
  );
}

export default Navbar;