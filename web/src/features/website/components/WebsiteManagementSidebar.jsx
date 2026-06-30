import React from 'react';
import { NavLink } from 'react-router-dom';
import { Globe, Palette, Image, Heart, Info, CreditCard, Truck, Building2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { getUserRoles, ROLES } from '../../../utils/roles';

const NAV_ITEMS = [
  { to: '/website-management/identity', icon: Globe, label: 'Store Identity' },
  { to: '/website-management/colors', icon: Palette, label: 'Brand Colors' },
  { to: '/website-management/hero', icon: Image, label: 'Hero Image' },
  { to: '/website-management/favicon', icon: Heart, label: 'Favicon & Assets' },
  { to: '/website-management/info', icon: Info, label: 'Store Info' },
  { to: '/website-management/payment', icon: CreditCard, label: 'Payment Settings' },
  { to: '/website-management/delivery', icon: Truck, label: 'Delivery Settings' },
  // TEMPORARY: tenant management lives here for now but is a PLATFORM function —
  // visible to SUPER_ADMIN only. It will move to a dedicated super-admin portal later.
  { to: '/website-management/tenants', icon: Building2, label: 'Tenants', superAdminOnly: true },
];

function WebsiteManagementSidebar() {
  const { currentUser } = useApp();
  const isSuperAdmin = getUserRoles(currentUser).includes(ROLES.SUPER_ADMIN);
  const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);

  return (
    <nav className="sidebar-container" aria-label="Website management">
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

export default WebsiteManagementSidebar;
