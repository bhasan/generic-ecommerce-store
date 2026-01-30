import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Package, Users, Store, User, LogOut, Settings, ChevronDown, LayoutDashboard, Truck, CheckCircle, HelpCircle } from 'lucide-react';
import CartPreview from '../cart/CartPreview';
import { hasRole } from '../../utils/roles';

function Navbar() {
  const { currentUser, cart, logout } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const profileRef = useRef(null);
  const adminRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cart.length;
  const isGuest = currentUser.email === 'guest@smokestation.com';

  const isCustomer = hasRole(currentUser, 'CUSTOMER')
    && !hasRole(currentUser, 'MANAGEMENT')
    && !hasRole(currentUser, 'ADMIN')
    && !hasRole(currentUser, 'DELIVERY_DRIVER');
  const isManagement = hasRole(currentUser, 'MANAGEMENT') || hasRole(currentUser, 'ADMIN');
  const isAdmin = hasRole(currentUser, 'ADMIN');
  const isDeliveryDriver = hasRole(currentUser, 'DELIVERY_DRIVER');

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
      {/* Products page - accessible to ALL users including admins/managers */}
      <NavLink 
        to="/products" 
        className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
      >
        <Package size={18} />
        <span>Products</span>
      </NavLink>

      {/* Help page - accessible to ALL authenticated users */}
      {!isGuest && (
        <NavLink 
          to="/help" 
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <HelpCircle size={18} />
          <span>Help</span>
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

      {/* Admin/Manager links */}
      {isManagement && (
        <>
          <NavLink 
            to="/orders" 
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Package size={18} />
            <span>Manage Orders</span>
          </NavLink>
          <NavLink 
            to="/manage-products" 
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Users size={18} />
            <span>Manage Products</span>
          </NavLink>
        </>
      )}

      {/* Admin-only dropdown menu */}
      {isAdmin && (
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
            aria-label="Admin menu"
          >
            <Settings size={18} />
            <span>Admin</span>
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
              <Store size={28} />
              <span>Smoke Station</span>
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
      </div>
    </>
  );
}

export default Navbar;