import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Package, Users, Store, User, LogOut, Settings, ChevronDown, LayoutDashboard } from 'lucide-react';

function Navbar() {
  const { currentUser, cart, logout } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const profileRef = useRef(null);
  const adminRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isGuest = currentUser.email === 'guest@smokestation.com';

  // Helper to check if user has a role (supports both old and new format)
  const hasRole = (role) => {
    const userRoles = currentUser.roles || (currentUser.role ? [currentUser.role] : []);
    return userRoles.includes(role);
  };

  const isCustomer = hasRole('CUSTOMER') && !hasRole('MANAGEMENT') && !hasRole('ADMIN');
  const isManagement = hasRole('MANAGEMENT') || hasRole('ADMIN');
  const isAdmin = hasRole('ADMIN');

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (adminRef.current && !adminRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close admin menu when route changes
  useEffect(() => {
    setShowAdminMenu(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/products" className="navbar-brand">
            <Store size={32} />
            <span>Smoke Station</span>
          </Link>
          
          <div className="navbar-links">
            {/* Products page - accessible to ALL users including admins/managers */}
            <NavLink 
              to="/products" 
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Package size={18} />
              <span>Products</span>
            </NavLink>

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
                  <span>Orders</span>
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
              <div className="admin-dropdown" ref={adminRef}>
                <button
                  className={`nav-link ${(location.pathname === '/dashboard' || location.pathname === '/users') ? 'nav-link-active' : ''}`}
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  aria-label="Admin menu"
                >
                  <Settings size={18} />
                  <span>Admin</span>
                  <ChevronDown size={16} className={`admin-chevron ${showAdminMenu ? 'admin-chevron-open' : ''}`} />
                </button>

                {showAdminMenu && (
                  <div className="admin-menu">
                    <button
                      onClick={() => {
                        setShowAdminMenu(false);
                        navigate('/dashboard');
                      }}
                      className={`admin-menu-item ${location.pathname === '/dashboard' ? 'admin-menu-item-active' : ''}`}
                    >
                      <LayoutDashboard size={16} />
                      <span>Dashboard</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowAdminMenu(false);
                        navigate('/users');
                      }}
                      className={`admin-menu-item ${location.pathname === '/users' ? 'admin-menu-item-active' : ''}`}
                    >
                      <Users size={16} />
                      <span>Users</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="navbar-right">
          <Link to="/cart" className="cart-button">
            <ShoppingCart size={22} />
            {cartCount > 0 && (
              <span className="cart-badge">{cartCount}</span>
            )}
          </Link>
          
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
                <div className="profile-menu">
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
  );
}

export default Navbar;