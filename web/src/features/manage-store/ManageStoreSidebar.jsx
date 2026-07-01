import React from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Tag, Image, Upload, Boxes } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getUserRoles, ROLES } from '../../utils/roles';

const NAV_ITEMS = [
  { to: '/manage-store/products', icon: Package, label: 'Products' },
  { to: '/manage-store/categories', icon: Tag, label: 'Categories' },
  { to: '/manage-store/media', icon: Image, label: 'Media Library' },
  { to: '/manage-store/bulk', icon: Upload, label: 'Bulk Management' },
  { to: '/manage-store/inventory', icon: Boxes, label: 'Store Inventory', adminOnly: true },
];

function ManageStoreSidebar() {
  const { currentUser } = useApp();
  const isAdmin = getUserRoles(currentUser).includes(ROLES.ADMIN);
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="sidebar-container" aria-label="Store management">
      <div className="sidebar-nav">
        {items.map(({ to, icon: Icon, label }) => (
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
