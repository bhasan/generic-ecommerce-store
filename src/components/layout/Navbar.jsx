import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Package, Users, Store } from 'lucide-react';

function Navbar() {
  const { currentUser, cart } = useApp();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/products" className="navbar-brand">
            <Store size={32} />
            <span>Smoke Station</span>
          </Link>
          
          <div className="navbar-links">
            {currentUser.role === 'CUSTOMER' && (
              <>
                <NavLink 
                  to="/products" 
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <Package size={18} />
                  <span>Products</span>
                </NavLink>
                <NavLink 
                  to="/orders" 
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <Package size={18} />
                  <span>My Orders</span>
                </NavLink>
              </>
            )}
            
            {(currentUser.role === 'MANAGEMENT' || currentUser.role === 'ADMIN') && (
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
          </div>
        </div>

        <div className="navbar-right">
          <div className="navbar-user">
            <span className="user-greeting">Hello,</span>
            <span className="user-name">{currentUser.name}</span>
          </div>
          
          {currentUser.role === 'CUSTOMER' && (
            <Link to="/cart" className="cart-button">
              <ShoppingCart size={22} />
              {cartCount > 0 && (
                <span className="cart-badge">{cartCount}</span>
              )}
            </Link>
          )}
          
          <Link to="/login" className="btn-login-nav">
            Login
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;