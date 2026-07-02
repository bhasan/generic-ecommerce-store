import { NavLink } from 'react-router-dom';
import { Building2, Activity } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin/tenants', icon: Building2, label: 'Tenants' },
  { to: '/admin/activity', icon: Activity, label: 'Activity' },
];

export default function AdminConsoleSidebar() {
  return (
    <nav className="sidebar-container" aria-label="Admin console">
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
