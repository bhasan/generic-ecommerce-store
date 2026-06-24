import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest } from '../../utils/roles';
import { Package, Tag, User, LogOut, Settings, Truck, HelpCircle, Wallet, Home, Moon, Sun, Monitor } from 'lucide-react';
import AdminDropdown from './AdminDropdown';
import MobileMenu from './MobileMenu';
import { useTheme, THEME_CYCLE } from '../../hooks/useTheme';
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
    branding,
  } = useApp();
  const { theme, setTheme } = useTheme();
  const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor };
  const THEME_LABELS = { dark: 'Dark theme (click for light)', light: 'Light theme (click for system)', system: 'System theme (click for dark)' };
  const ThemeIcon = THEME_ICONS[theme];

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const profileRef = useRef(null);
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
  const hasArrivedOrders = orders && orders.some(order => order.status === 'ARRIVED');

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus when route changes
  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
  };

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
          to="/my-orders"
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
          {hasArrivedOrders && <span className="nav-dot" aria-label="Customer arrived notification" />}
        </NavLink>
      )}

      {/* Manager/Admin only - Manage Store */}
      {isManagement && (
        <NavLink
          to="/manage-store"
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          title="Manage Store"
        >
          <Tag size={18} />
          <span>Manage Store</span>
        </NavLink>
      )}

    </>
  );

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-left">
            <Link to="/" className="navbar-brand">
              {branding?.logoUrl
                ? <img src={branding.logoUrl} alt={branding.storeName || 'Store'} className="navbar-logo" style={{ height: 32, objectFit: 'contain' }} />
                : <span>{branding?.storeName || 'Store'}</span>
              }
            </Link>

            {/* Group keeps nav links and admin dropdown visually adjacent */}
            <div className="navbar-nav-group">
              <div className="navbar-links">
                {renderNavLinks()}
              </div>
              {isManagement && <AdminDropdown isAdmin={isAdmin} />}
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
                    {canManageOrders && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/my-orders');
                        }}
                        className="profile-menu-item"
                      >
                        <Package size={16} />
                        <span>My Orders</span>
                      </button>
                    )}
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

            {/* Theme toggle — cycles dark → light → system */}
            <button
              className="nav-link-icon"
              onClick={() => setTheme(THEME_CYCLE[theme])}
              title={THEME_LABELS[theme]}
              aria-label={THEME_LABELS[theme]}
            >
              <ThemeIcon size={20} />
            </button>

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

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="mobile-menu-overlay open" onClick={() => setShowMobileMenu(false)} />
      )}

      {/* Mobile Menu */}
      <div className={`mobile-menu ${showMobileMenu ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <MobileMenu
          isGuest={isGuest}
          isCustomer={isCustomer}
          isDeliveryDriver={isDeliveryDriver}
          isManagement={isManagement}
          isAdmin={isAdmin}
          canManageOrders={canManageOrders}
          hasArrivedOrders={hasArrivedOrders}
        />
      </div>
    </>
  );
}

export default Navbar;
