import React from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Tag, Image, Upload } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/manage-store/products', icon: Package, label: 'Products' },
  { to: '/manage-store/categories', icon: Tag, label: 'Categories' },
  { to: '/manage-store/media', icon: Image, label: 'Media Library' },
  { to: '/manage-store/bulk', icon: Upload, label: 'Bulk Management' },
];

function ManageStoreSidebar() {
  return (
    <nav className="sidebar-container" aria-label="Store management">
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-nav-item${isActive ? ' active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default ManageStoreSidebar;
