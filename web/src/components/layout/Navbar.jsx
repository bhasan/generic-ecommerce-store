import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest } from '../../utils/roles';
import { Package, Users, User, LogOut, Settings, ChevronDown, LayoutDashboard, Truck, CheckCircle, HelpCircle, Wallet, Home } from 'lucide-react';
import CartPreview from '../cart/CartPreview';
import NotificationDropdown from './NotificationDropdown';
import { hasRole, ROLES } from '../../utils/roles';

function Navbar() {
  const {
    currentUser,
    cart,
    logout,
    staffNotificationCounts,
    creditBalance,
    inboxNotifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    notificationsMuted,
    toggleNotificationsMuted,
    handleNotificationsPanelOpen,
    orders,
  } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const profileRef = useRef(null);
  const adminRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cart.length;
  const isGuest = checkIsGuest(currentUser);
  const isLoginRoute = location.pathname === '/login';

  const isCustomer = hasRole(currentUser, ROLES.CUSTOMER)
    && !hasRole(currentUser, ROLES.EMPLOYEE)
    && !hasRole(currentUser, ROLES.MANAGEMENT)
    && !hasRole(currentUser, ROLES.ADMIN)
    && !hasRole(currentUser, ROLES.DELIVERY_DRIVER);
  const isEmployee = hasRole(currentUser, ROLES.EMPLOYEE);
  const isManagement = hasRole(currentUser, ROLES.MANAGEMENT) || hasRole(currentUser, ROLES.ADMIN);
  const isAdmin = hasRole(currentUser, ROLES.ADMIN);
  const isDeliveryDriver = hasRole(currentUser, ROLES.DELIVERY_DRIVER);
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

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
  };

  // Render navigation links (reusable for both desktop and mobile)
  const renderNavLinks = () => (
    <>
      {/* Start Here - link to home for all logged in users */}
      {!isGuest && (
        <NavLink
          to="/"
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          end
        >
          <Home size={18} />
          <span>Welcome</span>
        </NavLink>
      )}

      {/* Products page - only for authenticated users */}
      {!isGuest && (
        <NavLink
          to="/products"
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Package size={18} />
          <span>Products</span>
        </NavLink>
      )}

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
            className={`nav-link ${(location.pathname === '/dashboard' || location.pathname === '/users' || location.pathname === '/rejected-users' || location.pathname === '/order-history' || location.pathname === '/store-credit') ? 'nav-link-active' : ''}`}
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
                  navigate('/store-credit');
                  setShowAdminMenu(false);
                  setShowMobileMenu(false);
                }}
                className={`admin-menu-item ${location.pathname === '/store-credit' ? 'admin-menu-item-active' : ''}`}
              >
                <Wallet size={16} />
                <span>Store Credit</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/order-history');
                  setShowAdminMenu(false);
                  setShowMobileMenu(false);
                }}
                className={`admin-menu-item ${location.pathname === '/order-history' ? 'admin-menu-item-active' : ''}`}
              >
                <CheckCircle size={16} />
                <span>Orders History</span>
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
            <Link to="/" className="navbar-brand">
              <span>Smoke Station HTX</span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="navbar-links">
              {renderNavLinks()}
            </div>
          </div>

          <div className={`navbar-right ${isGuest ? 'navbar-right-guest' : 'navbar-right-auth'}`}>
            {/* Hamburger Menu Button (mobile only, hidden on login route) */}
            {!isLoginRoute && (
              <button
                className={`hamburger-btn ${showMobileMenu ? 'open' : ''}`}
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                aria-label="Toggle menu"
              >
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
              </button>
            )}

            {!isGuest && (
              <NotificationDropdown
                counts={staffNotificationCounts}
                canAccessDashboard={isManagement}
                notifications={inboxNotifications}
                unreadCount={unreadNotificationCount}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllNotificationsRead}
                notificationsMuted={notificationsMuted}
                onToggleMuted={toggleNotificationsMuted}
                onOpen={handleNotificationsPanelOpen}
                canManageOrders={canManageOrders}
                orders={orders}
              />
            )}
            {!isGuest && <CartPreview cart={cart} cartCount={cartCount} />}

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
                  <span className="profile-name">{currentUser.username}</span>
                </button>

                {showProfileMenu && (
                  <div className="profile-menu surface-card-accent">
                    <div className="profile-menu-header">
                      <p className="profile-menu-name">{currentUser.username}</p>
                      <p className="profile-menu-email">{currentUser.email}</p>
                      <div className="profile-menu-credit">
                        <Wallet size={13} />
                        <span>${creditBalance.toFixed(2)} store credit</span>
                        <span className="profile-menu-credit-tooltip" data-tooltip="Come into the store to fill your credit!">?</span>
                      </div>
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
            {!isGuest && (
              <NavLink
                to="/help"
                className={({ isActive }) => `nav-link-icon ${isActive ? 'nav-link-icon-active' : ''}`}
                title="Help & Support"
              >
                <HelpCircle size={20} />
              </NavLink>
            )}
          </div>
        </div>
      </nav>

      {/* TODO(mobile): Navbar mobile menu exists; keep this as the primary small-screen nav path and validate all role-based links remain accessible. */}
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
