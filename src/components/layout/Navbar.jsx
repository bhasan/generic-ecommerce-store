import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Package, Users } from 'lucide-react';

function Navbar() {
  const { currentUser, cart } = useApp();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getLinkClass = ({ isActive }) =>
    `flex items-center space-x-1 ${isActive ? 'text-purple-700' : 'text-gray-300 hover:text-purple-600'}`;

  return (
    <nav className="bg-black shadow-lg border-b-2 border-purple-800">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <Link to="/products" className="text-3xl font-bold text-purple-700">Smoke Station</Link>
          
          {currentUser.role === 'CUSTOMER' && (
            <>
              <NavLink to="/products" className={getLinkClass}>
                <Package size={20} />
                <span>Products</span>
              </NavLink>
              <NavLink to="/orders" className={getLinkClass}>
                <Package size={20} />
                <span>My Orders</span>
              </NavLink>
            </>
          )}
          
          {(currentUser.role === 'MANAGEMENT' || currentUser.role === 'ADMIN') && (
            <>
              <NavLink to="/orders" className={getLinkClass}>
                <Package size={20} />
                <span>Orders</span>
              </NavLink>
              <NavLink to="/manage-products" className={getLinkClass}>
                <Users size={20} />
                <span>Manage Products</span>
              </NavLink>
            </>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-gray-300">{currentUser.name}</span>
          
          {currentUser.role === 'CUSTOMER' && (
            <Link to="/cart" className="relative">
              <ShoppingCart className="text-gray-300 hover:text-purple-600" size={24} />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-purple-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  {cartCount}
                </span>
              )}
            </Link>
          )}
          
          <Link to="/login" className="text-gray-300 hover:text-purple-600">
            Login
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;